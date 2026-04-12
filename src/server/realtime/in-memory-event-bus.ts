import { EventEmitter } from "node:events";

import type { ProjectEvent } from "../../shared/types";
import type { ProjectEventBus, ProjectEventListener } from "./event-bus";

const STREAM_EMITTER_KEY = Symbol.for(
  "collab-task-system.project-event-bus.emitter",
);

type GlobalWithEmitter = typeof globalThis & {
  [STREAM_EMITTER_KEY]?: EventEmitter;
};

function getEmitter(): EventEmitter {
  const runtime = globalThis as GlobalWithEmitter;

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

export class InMemoryProjectEventBus implements ProjectEventBus {
  publish(event: ProjectEvent): void {
    getEmitter().emit(channel(event.projectId), event);
  }

  async subscribe(
    projectId: string,
    listener: ProjectEventListener,
  ): Promise<() => void> {
    const emitter = getEmitter();
    const projectChannel = channel(projectId);
    emitter.on(projectChannel, listener);

    return () => {
      emitter.off(projectChannel, listener);
    };
  }
}
