import type { ProjectEvent } from "../../shared/types";
import { InMemoryProjectEventBus } from "./in-memory-event-bus";
import { RedisProjectEventBus } from "./redis-event-bus";

export type ProjectEventListener = (event: ProjectEvent) => void;

export interface ProjectEventBus {
  publish: (event: ProjectEvent) => void;
  subscribe: (projectId: string, listener: ProjectEventListener) => () => void;
}

type EventBusOptions = {
  redisUrl?: string;
};

const PROJECT_EVENT_BUS_KEY = Symbol.for(
  "collab-task-system.project-event-bus",
);

type GlobalWithProjectEventBus = typeof globalThis & {
  [PROJECT_EVENT_BUS_KEY]?: ProjectEventBus;
};

export function createProjectEventBus(
  options: EventBusOptions = {},
): ProjectEventBus {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;

  if (redisUrl) {
    return new RedisProjectEventBus(redisUrl);
  }

  return new InMemoryProjectEventBus();
}

export function getProjectEventBus(): ProjectEventBus {
  const runtime = globalThis as GlobalWithProjectEventBus;

  if (!runtime[PROJECT_EVENT_BUS_KEY]) {
    runtime[PROJECT_EVENT_BUS_KEY] = createProjectEventBus();
  }

  return runtime[PROJECT_EVENT_BUS_KEY]!;
}

export { InMemoryProjectEventBus };
export { RedisProjectEventBus };
