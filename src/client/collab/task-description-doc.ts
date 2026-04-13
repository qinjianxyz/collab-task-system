"use client";

import * as Y from "yjs";

import {
  fetchTaskDescriptionState,
  syncTaskDescriptionUpdate,
} from "../api";

function encodeDocState(update: Uint8Array): string {
  const binary = Array.from(update, (value) => String.fromCharCode(value)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeDocState(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (value) => value.charCodeAt(0));
}

type TaskDescriptionDocOptions = {
  clientId: string;
  projectId: string;
  taskId: string;
};

export type TaskDescriptionDocController = {
  connect: () => Promise<void>;
  destroy: () => void;
  getValue: () => string;
  observe: (listener: (origin: "local" | "remote") => void) => () => void;
  replaceText: (value: string) => void;
};

export function createTaskDescriptionDocController(
  options: TaskDescriptionDocOptions,
): TaskDescriptionDocController {
  const doc = new Y.Doc();
  const text = doc.getText("description");
  let eventSource: EventSource | null = null;
  const listeners = new Set<(origin: "local" | "remote") => void>();

  const notify = (origin: "local" | "remote") => {
    for (const listener of listeners) {
      listener(origin);
    }
  };

  const updateHandler = async (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") {
      return;
    }

    await syncTaskDescriptionUpdate(options.projectId, options.taskId, {
      clientId: options.clientId,
      update: encodeDocState(update),
    });
  };

  doc.on("update", updateHandler);

  return {
    async connect() {
      const state = await fetchTaskDescriptionState(options.projectId, options.taskId);
      Y.applyUpdate(doc, decodeDocState(state.state), "remote");
      notify("remote");

      const streamUrl = new URL(
        `/api/projects/${options.projectId}/tasks/${options.taskId}/description/stream`,
        window.location.origin,
      );
      streamUrl.searchParams.set("clientId", options.clientId);

      eventSource = new EventSource(streamUrl.toString());
      eventSource.addEventListener("description-update", (message) => {
        const payload = JSON.parse((message as MessageEvent<string>).data) as {
          update: string;
        };
        Y.applyUpdate(doc, decodeDocState(payload.update), "remote");
        notify("remote");
      });
    },
    destroy() {
      eventSource?.close();
      eventSource = null;
      doc.off("update", updateHandler);
      doc.destroy();
      listeners.clear();
    },
    getValue() {
      return text.toString();
    },
    observe(listener: (origin: "local" | "remote") => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replaceText(value: string) {
      doc.transact(() => {
        text.delete(0, text.length);
        text.insert(0, value);
      }, options.clientId);
      notify("local");
    },
  };
}
