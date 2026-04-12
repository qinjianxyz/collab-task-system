import type { ProjectEvent } from "../../shared/types";
import { InMemoryProjectEventBus } from "./in-memory-event-bus";
import { RedisProjectEventBus } from "./redis-event-bus";

export type ProjectEventListener = (event: ProjectEvent) => void;

export interface ProjectEventBus {
  publish: (event: ProjectEvent) => void;
  subscribe: (
    projectId: string,
    listener: ProjectEventListener,
  ) => Promise<() => void>;
}

type EventBusOptions = {
  redisUrl?: string;
};

const RECENT_LOCAL_EVENT_TTL_MS = 15_000;

const PROJECT_EVENT_BUS_KEY = Symbol.for(
  "collab-task-system.project-event-bus",
);

type GlobalWithProjectEventBus = typeof globalThis & {
  [PROJECT_EVENT_BUS_KEY]?: ProjectEventBus;
};

export class ResilientRedisProjectEventBus extends RedisProjectEventBus {
  private readonly fallback = new InMemoryProjectEventBus();

  private readonly recentLocalEventIds = new Map<string, number>();

  publish(event: ProjectEvent): void {
    this.rememberLocalEvent(event.id);
    this.fallback.publish(event);

    try {
      super.publish(event);
    } catch {
      // The in-memory fallback already delivered the event locally.
    }
  }

  async subscribe(
    projectId: string,
    listener: ProjectEventListener,
  ): Promise<() => void> {
    const unsubscribeFallback = await this.fallback.subscribe(projectId, listener);
    let unsubscribeRedis: () => void = () => undefined;

    try {
      unsubscribeRedis = await super.subscribe(projectId, (event) => {
        if (this.wasRecentlyPublishedLocally(event.id)) {
          return;
        }

        listener(event);
      });
    } catch {
      // Continue serving the single-process fallback path.
    }

    return () => {
      unsubscribeFallback();
      unsubscribeRedis();
    };
  }

  private rememberLocalEvent(eventId: string): void {
    this.pruneRecentLocalEvents();
    this.recentLocalEventIds.set(eventId, Date.now());
  }

  private wasRecentlyPublishedLocally(eventId: string): boolean {
    this.pruneRecentLocalEvents();

    const publishedAt = this.recentLocalEventIds.get(eventId);
    if (!publishedAt) {
      return false;
    }

    return Date.now() - publishedAt < RECENT_LOCAL_EVENT_TTL_MS;
  }

  private pruneRecentLocalEvents(): void {
    const now = Date.now();

    for (const [eventId, publishedAt] of this.recentLocalEventIds) {
      if (now - publishedAt >= RECENT_LOCAL_EVENT_TTL_MS) {
        this.recentLocalEventIds.delete(eventId);
      }
    }
  }
}

export function createProjectEventBus(
  options: EventBusOptions = {},
): ProjectEventBus {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;

  if (redisUrl) {
    return new ResilientRedisProjectEventBus(redisUrl);
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
