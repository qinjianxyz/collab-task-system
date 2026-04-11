import { createClient } from "redis";

import type { ProjectEvent } from "../../shared/types";
import type { ProjectEventBus, ProjectEventListener } from "./event-bus";

type RedisClient = ReturnType<typeof createClient>;

function channel(projectId: string): string {
  return `project:${projectId}:events`;
}

export class RedisProjectEventBus implements ProjectEventBus {
  private readonly listenersByChannel = new Map<string, Set<ProjectEventListener>>();

  private publisherPromise: Promise<RedisClient> | null = null;

  private subscriberPromise: Promise<RedisClient> | null = null;

  private readonly subscriptionPromises = new Map<string, Promise<void>>();

  private readonly subscribedChannels = new Set<string>();

  constructor(private readonly redisUrl: string) {}

  publish(event: ProjectEvent): void {
    const projectChannel = channel(event.projectId);

    void this.getPublisher()
      .then((client) => client.publish(projectChannel, JSON.stringify(event)))
      .catch(() => {
        // Preserve the single-instance demo path even if Redis is unavailable.
      });
  }

  subscribe(projectId: string, listener: ProjectEventListener): () => void {
    const projectChannel = channel(projectId);
    const listeners = this.listenersByChannel.get(projectChannel) ?? new Set();
    listeners.add(listener);
    this.listenersByChannel.set(projectChannel, listeners);

    void this.ensureSubscribed(projectChannel);

    return () => {
      const currentListeners = this.listenersByChannel.get(projectChannel);
      if (!currentListeners) {
        return;
      }

      currentListeners.delete(listener);

      if (currentListeners.size === 0) {
        this.listenersByChannel.delete(projectChannel);
        void this.unsubscribe(projectChannel);
      }
    };
  }

  private getPublisher(): Promise<RedisClient> {
    if (!this.publisherPromise) {
      this.publisherPromise = this.connectClient();
    }

    if (!this.publisherPromise) {
      throw new Error("publisher promise was not initialized");
    }

    return this.publisherPromise;
  }

  private getSubscriber(): Promise<RedisClient> {
    if (!this.subscriberPromise) {
      this.subscriberPromise = this.connectClient();
    }

    if (!this.subscriberPromise) {
      throw new Error("subscriber promise was not initialized");
    }

    return this.subscriberPromise;
  }

  private connectClient(): Promise<RedisClient> {
    const client = createClient({
      url: this.redisUrl,
    });
    client.on("error", () => undefined);

    return client.connect().then(() => client);
  }

  private ensureSubscribed(projectChannel: string): Promise<void> {
    const existing = this.subscriptionPromises.get(projectChannel);
    if (existing) {
      return existing;
    }

    if (this.subscribedChannels.has(projectChannel)) {
      return Promise.resolve();
    }

    const subscribePromise = this.getSubscriber()
      .then((client) =>
        client.subscribe(projectChannel, (message) => {
          this.handleMessage(projectChannel, message);
        }),
      )
      .then(() => {
        this.subscribedChannels.add(projectChannel);
      })
      .catch(() => {
        this.subscribedChannels.delete(projectChannel);
      })
      .finally(() => {
        this.subscriptionPromises.delete(projectChannel);
      });

    this.subscriptionPromises.set(projectChannel, subscribePromise);

    return subscribePromise;
  }

  private async unsubscribe(projectChannel: string): Promise<void> {
    this.subscribedChannels.delete(projectChannel);
    await this.subscriptionPromises.get(projectChannel);

    try {
      const client = await this.getSubscriber();
      await client.unsubscribe(projectChannel);
    } catch {
      // Listener bookkeeping is already cleared locally.
    }
  }

  private handleMessage(projectChannel: string, message: string): void {
    let parsedEvent: ProjectEvent;

    try {
      parsedEvent = JSON.parse(message) as ProjectEvent;
    } catch {
      return;
    }

    const listeners = this.listenersByChannel.get(projectChannel);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(parsedEvent);
    }
  }

  close(): void {
    void this.publisherPromise?.then((client) => client.quit()).catch(() => undefined);
    void this.subscriberPromise?.then((client) => client.quit()).catch(() => undefined);
    this.publisherPromise = null;
    this.subscriberPromise = null;
    this.subscriptionPromises.clear();
    this.subscribedChannels.clear();
    this.listenersByChannel.clear();
  }
}
