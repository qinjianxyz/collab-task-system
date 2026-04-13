import crypto from "node:crypto";
import { EventEmitter } from "node:events";

import type { ProjectEvent } from "../../shared/types";

type ProjectEventListener = (event: ProjectEvent) => void;

export type ProjectEventBus = {
  publish: (event: ProjectEvent) => void;
  subscribe: (projectId: string, listener: ProjectEventListener) => () => void;
  dispose?: () => Promise<void>;
};

const PROJECT_EVENT_BUS_KEY = Symbol.for("collab-task-system.project-event-bus");
let hasWarnedAboutRedisEventBus = false;

type GlobalWithProjectEventBus = typeof globalThis & {
  [PROJECT_EVENT_BUS_KEY]?: ProjectEventBus;
};

function channel(projectId: string): string {
  return `project:${projectId}:events`;
}

export function createInMemoryProjectEventBus(): ProjectEventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  return {
    publish(event) {
      emitter.emit(channel(event.projectId), event);
    },
    subscribe(projectId, listener) {
      const projectChannel = channel(projectId);
      emitter.on(projectChannel, listener);

      return () => {
        emitter.off(projectChannel, listener);
      };
    },
  };
}

export function createRedisProjectEventBus(redisUrl: string): ProjectEventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  const instanceId = crypto.randomUUID();
  const subscriptionCounts = new Map<string, number>();
  const activeRedisSubscriptions = new Set<string>();

  let publishClientPromise: Promise<{
    publish: (channel: string, message: string) => Promise<unknown>;
    quit: () => Promise<unknown>;
  }> | null = null;
  let subscribeClientPromise: Promise<{
    subscribe: (channel: string, listener: (message: string) => void) => Promise<unknown>;
    unsubscribe: (channel: string) => Promise<unknown>;
    quit: () => Promise<unknown>;
  }> | null = null;

  async function getPublishClient() {
    if (!publishClientPromise) {
      publishClientPromise = import("redis").then(async ({ createClient }) => {
        const client = createClient({ url: redisUrl });
        client.on("error", () => undefined);
        await client.connect();
        return client;
      });
    }

    return publishClientPromise;
  }

  async function getSubscribeClient() {
    if (!subscribeClientPromise) {
      subscribeClientPromise = import("redis").then(async ({ createClient }) => {
        const client = createClient({ url: redisUrl });
        client.on("error", () => undefined);
        await client.connect();
        return client;
      });
    }

    return subscribeClientPromise;
  }

  async function ensureRedisSubscription(projectChannel: string): Promise<void> {
    if (activeRedisSubscriptions.has(projectChannel)) {
      return;
    }

    activeRedisSubscriptions.add(projectChannel);

    const subscribeClient = await getSubscribeClient();
    await subscribeClient.subscribe(projectChannel, (message) => {
      try {
        const payload = JSON.parse(message) as {
          event: ProjectEvent;
          origin: string;
        };

        if (payload.origin === instanceId) {
          return;
        }

        emitter.emit(projectChannel, payload.event);
      } catch {
        // ignore malformed bridge payloads
      }
    });
  }

  return {
    publish(event) {
      const projectChannel = channel(event.projectId);
      emitter.emit(projectChannel, event);

      void getPublishClient()
        .then((client) =>
          client.publish(
            projectChannel,
            JSON.stringify({
              event,
              origin: instanceId,
            }),
          ),
        )
        .catch(() => undefined);
    },
    subscribe(projectId, listener) {
      const projectChannel = channel(projectId);
      emitter.on(projectChannel, listener);
      subscriptionCounts.set(projectChannel, (subscriptionCounts.get(projectChannel) ?? 0) + 1);
      void ensureRedisSubscription(projectChannel).catch(() => undefined);

      return () => {
        emitter.off(projectChannel, listener);

        const nextCount = Math.max((subscriptionCounts.get(projectChannel) ?? 1) - 1, 0);
        if (nextCount === 0) {
          subscriptionCounts.delete(projectChannel);

          if (activeRedisSubscriptions.has(projectChannel)) {
            activeRedisSubscriptions.delete(projectChannel);
            void getSubscribeClient()
              .then((client) => client.unsubscribe(projectChannel))
              .catch(() => undefined);
          }
          return;
        }

        subscriptionCounts.set(projectChannel, nextCount);
      };
    },
    async dispose() {
      const publishClient = await publishClientPromise?.catch(() => null);
      const subscribeClient = await subscribeClientPromise?.catch(() => null);
      await publishClient?.quit().catch(() => undefined);
      await subscribeClient?.quit().catch(() => undefined);
    },
  };
}

export function getProjectEventBus(env: NodeJS.ProcessEnv = process.env): ProjectEventBus {
  const runtime = globalThis as GlobalWithProjectEventBus;

  if (!runtime[PROJECT_EVENT_BUS_KEY]) {
    const redisUrl = env.REDIS_URL?.trim();

    if (redisUrl) {
      try {
        runtime[PROJECT_EVENT_BUS_KEY] = createRedisProjectEventBus(redisUrl);
      } catch (error) {
        if (!hasWarnedAboutRedisEventBus) {
          console.warn("falling back to in-memory event bus", error);
          hasWarnedAboutRedisEventBus = true;
        }
        runtime[PROJECT_EVENT_BUS_KEY] = createInMemoryProjectEventBus();
      }
    } else {
      runtime[PROJECT_EVENT_BUS_KEY] = createInMemoryProjectEventBus();
    }
  }

  return runtime[PROJECT_EVENT_BUS_KEY]!;
}

export function resetProjectEventBusForTests(): void {
  const runtime = globalThis as GlobalWithProjectEventBus;
  void runtime[PROJECT_EVENT_BUS_KEY]?.dispose?.();
  delete runtime[PROJECT_EVENT_BUS_KEY];
}
