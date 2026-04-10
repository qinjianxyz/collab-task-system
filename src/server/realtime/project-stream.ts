import { EventEmitter } from "node:events";

import type { ProjectEvent } from "../../shared/types";

type ProjectEventListener = (event: ProjectEvent) => void;

const STREAM_EMITTER_KEY = Symbol.for("collab-task-system.project-stream.emitter");

type GlobalWithProjectStream = typeof globalThis & {
  [STREAM_EMITTER_KEY]?: EventEmitter;
};

function getEmitter(): EventEmitter {
  const runtime = globalThis as GlobalWithProjectStream;

  if (!runtime[STREAM_EMITTER_KEY]) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    runtime[STREAM_EMITTER_KEY] = emitter;
  }

  return runtime[STREAM_EMITTER_KEY]!;
}

function channel(projectId: string): string {
  return `project:${projectId}:events`;
}

export function publishProjectEvent(event: ProjectEvent): void {
  getEmitter().emit(channel(event.projectId), event);
}

export function subscribeToProjectEvents(
  projectId: string,
  listener: ProjectEventListener,
): () => void {
  const emitter = getEmitter();
  const projectChannel = channel(projectId);
  emitter.on(projectChannel, listener);

  return () => {
    emitter.off(projectChannel, listener);
  };
}
