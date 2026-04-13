import { EventEmitter } from "node:events";

import type { PresenceViewer } from "../../shared/types";

type PresenceOptions = {
  disconnectTtlMs?: number;
};

type PresenceListener = (viewers: PresenceViewer[]) => void;

export type PresenceStore = {
  getViewers: (projectId: string) => PresenceViewer[];
  scheduleRemoval: (projectId: string, clientId: string) => void;
  subscribe: (projectId: string, listener: PresenceListener) => () => void;
  upsertViewer: (projectId: string, viewer: PresenceViewer) => void;
};

const PRESENCE_STORE_KEY = Symbol.for("collab-task-system.presence-store");

type GlobalWithPresenceStore = typeof globalThis & {
  [PRESENCE_STORE_KEY]?: PresenceStore;
};

function sortViewers(viewers: Iterable<PresenceViewer>): PresenceViewer[] {
  return [...viewers].sort(
    (left, right) =>
      left.connectedAt - right.connectedAt ||
      left.userId.localeCompare(right.userId) ||
      left.clientId.localeCompare(right.clientId),
  );
}

export function createPresenceStore(
  options: PresenceOptions = {},
): PresenceStore {
  const disconnectTtlMs = options.disconnectTtlMs ?? 5_000;
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  const viewersByProject = new Map<string, Map<string, PresenceViewer>>();
  const timeoutsByProject = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

  function channel(projectId: string): string {
    return `project:${projectId}:presence`;
  }

  function emit(projectId: string): void {
    emitter.emit(channel(projectId), getViewers(projectId));
  }

  function getTimeouts(projectId: string): Map<string, ReturnType<typeof setTimeout>> {
    const existing = timeoutsByProject.get(projectId);
    if (existing) {
      return existing;
    }

    const created = new Map<string, ReturnType<typeof setTimeout>>();
    timeoutsByProject.set(projectId, created);
    return created;
  }

  function clearRemoval(projectId: string, clientId: string): void {
    const projectTimeouts = timeoutsByProject.get(projectId);
    const timeout = projectTimeouts?.get(clientId);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    projectTimeouts?.delete(clientId);
  }

  function getViewers(projectId: string): PresenceViewer[] {
    return sortViewers(viewersByProject.get(projectId)?.values() ?? []);
  }

  function upsertViewer(projectId: string, viewer: PresenceViewer): void {
    clearRemoval(projectId, viewer.clientId);

    const projectViewers = viewersByProject.get(projectId) ?? new Map<string, PresenceViewer>();
    const existingViewer = projectViewers.get(viewer.clientId);
    projectViewers.set(viewer.clientId, {
      ...viewer,
      connectedAt: existingViewer?.connectedAt ?? viewer.connectedAt,
    });
    viewersByProject.set(projectId, projectViewers);
    emit(projectId);
  }

  function scheduleRemoval(projectId: string, clientId: string): void {
    const projectViewers = viewersByProject.get(projectId);
    if (!projectViewers?.has(clientId)) {
      return;
    }

    clearRemoval(projectId, clientId);

    const projectTimeouts = getTimeouts(projectId);
    projectTimeouts.set(
      clientId,
      setTimeout(() => {
        projectTimeouts.delete(clientId);
        projectViewers.delete(clientId);

        if (projectViewers.size === 0) {
          viewersByProject.delete(projectId);
        }

        emit(projectId);
      }, disconnectTtlMs),
    );
  }

  function subscribe(projectId: string, listener: PresenceListener): () => void {
    const projectChannel = channel(projectId);
    emitter.on(projectChannel, listener);

    return () => {
      emitter.off(projectChannel, listener);
    };
  }

  return {
    getViewers,
    scheduleRemoval,
    subscribe,
    upsertViewer,
  };
}

export function getPresenceStore(): PresenceStore {
  const runtime = globalThis as GlobalWithPresenceStore;

  if (!runtime[PRESENCE_STORE_KEY]) {
    runtime[PRESENCE_STORE_KEY] = createPresenceStore();
  }

  return runtime[PRESENCE_STORE_KEY]!;
}
