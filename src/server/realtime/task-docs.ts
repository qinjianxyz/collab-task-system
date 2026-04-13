import { EventEmitter } from "node:events";

import * as Y from "yjs";

import { withTransaction } from "../db/client";
import { DomainError } from "../domain/errors";

type TaskDocListener = (payload: { clientId: string; update: string }) => void;

export type TaskDescriptionStore = {
  applyClientUpdate: (
    projectId: string,
    taskId: string,
    encodedUpdate: string,
    initialText: string,
    clientId?: string,
  ) => void;
  getDocumentState: (projectId: string, taskId: string, initialText: string) => string;
  subscribe: (projectId: string, taskId: string, listener: TaskDocListener) => () => void;
};

const TASK_DESCRIPTION_STORE_KEY = Symbol.for("collab-task-system.task-docs");

type GlobalWithTaskDescriptionStore = typeof globalThis & {
  [TASK_DESCRIPTION_STORE_KEY]?: TaskDescriptionStore;
};

export function encodeDocState(update: Uint8Array): string {
  return Buffer.from(update).toString("base64url");
}

export function decodeDocState(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, "base64url"));
}

function taskKey(projectId: string, taskId: string): string {
  return `${projectId}:${taskId}`;
}

function descriptionChannel(projectId: string, taskId: string): string {
  return `task:${projectId}:${taskId}:description`;
}

function seedDoc(doc: Y.Doc, initialText: string): void {
  const text = doc.getText("description");
  if (text.length === 0 && initialText.length > 0) {
    doc.transact(() => {
      text.insert(0, initialText);
    }, "seed");
  }
}

export function createTaskDescriptionStore(): TaskDescriptionStore {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const docs = new Map<string, Y.Doc>();

  function ensureDoc(projectId: string, taskId: string, initialText: string): Y.Doc {
    const key = taskKey(projectId, taskId);
    const existing = docs.get(key);
    if (existing) {
      seedDoc(existing, initialText);
      return existing;
    }

    const created = new Y.Doc();
    seedDoc(created, initialText);
    docs.set(key, created);
    return created;
  }

  function getDocumentState(projectId: string, taskId: string, initialText: string): string {
    const doc = ensureDoc(projectId, taskId, initialText);
    return encodeDocState(Y.encodeStateAsUpdate(doc));
  }

  function applyClientUpdate(
    projectId: string,
    taskId: string,
    encodedUpdate: string,
    initialText: string,
    clientId = "",
  ): void {
    const doc = ensureDoc(projectId, taskId, initialText);
    Y.applyUpdate(doc, decodeDocState(encodedUpdate), clientId || "remote");
    emitter.emit(descriptionChannel(projectId, taskId), {
      clientId,
      update: encodedUpdate,
    });
  }

  function subscribe(
    projectId: string,
    taskId: string,
    listener: TaskDocListener,
  ): () => void {
    const channel = descriptionChannel(projectId, taskId);
    emitter.on(channel, listener);
    return () => {
      emitter.off(channel, listener);
    };
  }

  return {
    applyClientUpdate,
    getDocumentState,
    subscribe,
  };
}

export function getTaskDescriptionStore(): TaskDescriptionStore {
  const runtime = globalThis as GlobalWithTaskDescriptionStore;

  if (!runtime[TASK_DESCRIPTION_STORE_KEY]) {
    runtime[TASK_DESCRIPTION_STORE_KEY] = createTaskDescriptionStore();
  }

  return runtime[TASK_DESCRIPTION_STORE_KEY]!;
}

export async function getPersistedTaskDescription(
  projectId: string,
  taskId: string,
): Promise<string> {
  const result = await withTransaction((client) =>
    client.query<{ configuration: Record<string, unknown> }>(
      "select configuration from tasks where project_id = $1 and id = $2",
      [projectId, taskId],
    ),
  );

  if (!result.rows[0]) {
    throw new DomainError(`task ${taskId} does not exist in project ${projectId}`);
  }

  const configuration = result.rows[0]?.configuration ?? {};
  const description = configuration.description;
  return typeof description === "string" ? description : "";
}
