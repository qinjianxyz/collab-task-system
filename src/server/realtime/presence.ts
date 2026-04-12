import { EventEmitter } from "node:events";

import { createClient } from "redis";

import {
  presenceViewerSchema,
  type PresenceViewer,
} from "../../shared/types";

type PresenceOptions = {
  disconnectTtlMs?: number;
  redisUrl?: string;
};

type PresenceListener = (viewers: PresenceViewer[]) => void;

export interface PresenceStore {
  getViewers: (projectId: string) => Promise<PresenceViewer[]>;
  scheduleRemoval: (projectId: string, clientId: string) => void;
  subscribe: (
    projectId: string,
    listener: PresenceListener,
  ) => Promise<() => void>;
  upsertViewer: (projectId: string, viewer: PresenceViewer) => Promise<void>;
}

type GlobalWithPresenceStore = typeof globalThis & {
  [PRESENCE_STORE_KEY]?: PresenceStore;
};

type RedisClient = ReturnType<typeof createClient>;

const PRESENCE_STORE_KEY = Symbol.for("collab-task-system.presence-store");
const presenceViewerListSchema = presenceViewerSchema.array();

function sortViewers(viewers: Iterable<PresenceViewer>): PresenceViewer[] {
  return [...viewers].sort(
    (left, right) =>
      left.connectedAt - right.connectedAt ||
      left.userId.localeCompare(right.userId) ||
      left.clientId.localeCompare(right.clientId),
  );
}

function presenceChannel(projectId: string): string {
  return `project:${projectId}:presence`;
}

function viewerSetKey(projectId: string): string {
  return `project:${projectId}:presence:viewers`;
}

function viewerKey(projectId: string, clientId: string): string {
  return `project:${projectId}:presence:${clientId}`;
}

function getTimeoutMap(
  timeoutsByProject: Map<string, Map<string, ReturnType<typeof setTimeout>>>,
  projectId: string,
): Map<string, ReturnType<typeof setTimeout>> {
  const existing = timeoutsByProject.get(projectId);
  if (existing) {
    return existing;
  }

  const created = new Map<string, ReturnType<typeof setTimeout>>();
  timeoutsByProject.set(projectId, created);
  return created;
}

export class InMemoryPresenceStore implements PresenceStore {
  private readonly emitter = new EventEmitter();

  private readonly timeoutsByProject = new Map<
    string,
    Map<string, ReturnType<typeof setTimeout>>
  >();

  private readonly viewersByProject = new Map<string, Map<string, PresenceViewer>>();

  constructor(private readonly disconnectTtlMs = 5_000) {
    this.emitter.setMaxListeners(0);
  }

  async getViewers(projectId: string): Promise<PresenceViewer[]> {
    return sortViewers(this.viewersByProject.get(projectId)?.values() ?? []);
  }

  async upsertViewer(projectId: string, viewer: PresenceViewer): Promise<void> {
    this.clearRemoval(projectId, viewer.clientId);

    const projectViewers = this.viewersByProject.get(projectId) ?? new Map();
    projectViewers.set(viewer.clientId, viewer);
    this.viewersByProject.set(projectId, projectViewers);
    await this.emit(projectId);
  }

  scheduleRemoval(projectId: string, clientId: string): void {
    const projectViewers = this.viewersByProject.get(projectId);
    if (!projectViewers?.has(clientId)) {
      return;
    }

    this.clearRemoval(projectId, clientId);

    const projectTimeouts = getTimeoutMap(this.timeoutsByProject, projectId);
    projectTimeouts.set(
      clientId,
      setTimeout(() => {
        void this.removeViewer(projectId, clientId);
      }, this.disconnectTtlMs),
    );
  }

  async subscribe(
    projectId: string,
    listener: PresenceListener,
  ): Promise<() => void> {
    const channel = presenceChannel(projectId);
    this.emitter.on(channel, listener);

    return () => {
      this.emitter.off(channel, listener);
    };
  }

  private clearRemoval(projectId: string, clientId: string): void {
    const projectTimeouts = this.timeoutsByProject.get(projectId);
    const timeout = projectTimeouts?.get(clientId);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    projectTimeouts?.delete(clientId);
  }

  private async emit(projectId: string): Promise<void> {
    this.emitter.emit(presenceChannel(projectId), await this.getViewers(projectId));
  }

  private async removeViewer(projectId: string, clientId: string): Promise<void> {
    this.clearRemoval(projectId, clientId);

    const projectViewers = this.viewersByProject.get(projectId);
    if (!projectViewers?.has(clientId)) {
      return;
    }

    projectViewers.delete(clientId);
    if (projectViewers.size === 0) {
      this.viewersByProject.delete(projectId);
    }

    await this.emit(projectId);
  }
}

export class RedisPresenceStore implements PresenceStore {
  private readonly listenersByChannel = new Map<string, Set<PresenceListener>>();

  private readonly subscriptionPromises = new Map<string, Promise<void>>();

  private readonly subscribedChannels = new Set<string>();

  private readonly timeoutsByProject = new Map<
    string,
    Map<string, ReturnType<typeof setTimeout>>
  >();

  private commandPromise: Promise<RedisClient> | null = null;

  private subscriberPromise: Promise<RedisClient> | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly disconnectTtlMs = 5_000,
  ) {}

  async getViewers(projectId: string): Promise<PresenceViewer[]> {
    const client = await this.getCommandClient();
    const clientIds = await client.sMembers(viewerSetKey(projectId));

    if (clientIds.length === 0) {
      return [];
    }

    const payloads = await client.mGet(clientIds.map((clientId) => viewerKey(projectId, clientId)));
    const staleClientIds: string[] = [];
    const viewers: PresenceViewer[] = [];

    payloads.forEach((payload, index) => {
      const clientId = clientIds[index];
      if (!clientId) {
        return;
      }

      if (!payload) {
        staleClientIds.push(clientId);
        return;
      }

      try {
        viewers.push(presenceViewerSchema.parse(JSON.parse(payload)));
      } catch {
        staleClientIds.push(clientId);
      }
    });

    if (staleClientIds.length > 0) {
      await client.sRem(viewerSetKey(projectId), staleClientIds);
    }

    return sortViewers(viewers);
  }

  async upsertViewer(projectId: string, viewer: PresenceViewer): Promise<void> {
    this.clearRemoval(projectId, viewer.clientId);

    const client = await this.getCommandClient();
    const batch = client.multi();
    batch.sAdd(viewerSetKey(projectId), viewer.clientId);
    batch.set(viewerKey(projectId, viewer.clientId), JSON.stringify(viewer));
    await batch.exec();
    await this.publish(projectId);
  }

  scheduleRemoval(projectId: string, clientId: string): void {
    this.clearRemoval(projectId, clientId);

    const projectTimeouts = getTimeoutMap(this.timeoutsByProject, projectId);
    projectTimeouts.set(
      clientId,
      setTimeout(() => {
        void this.removeViewer(projectId, clientId);
      }, this.disconnectTtlMs),
    );
  }

  async subscribe(
    projectId: string,
    listener: PresenceListener,
  ): Promise<() => void> {
    const channel = presenceChannel(projectId);
    const listeners = this.listenersByChannel.get(channel) ?? new Set();
    listeners.add(listener);
    this.listenersByChannel.set(channel, listeners);

    await this.ensureSubscribed(channel);

    return () => {
      const currentListeners = this.listenersByChannel.get(channel);
      if (!currentListeners) {
        return;
      }

      currentListeners.delete(listener);

      if (currentListeners.size === 0) {
        this.listenersByChannel.delete(channel);
        void this.unsubscribe(channel);
      }
    };
  }

  private clearRemoval(projectId: string, clientId: string): void {
    const projectTimeouts = this.timeoutsByProject.get(projectId);
    const timeout = projectTimeouts?.get(clientId);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    projectTimeouts?.delete(clientId);
  }

  private connectClient(): Promise<RedisClient> {
    const client = createClient({
      url: this.redisUrl,
    });
    client.on("error", () => undefined);

    return client.connect().then(() => client);
  }

  private getCommandClient(): Promise<RedisClient> {
    if (!this.commandPromise) {
      this.commandPromise = this.connectClient();
    }

    if (!this.commandPromise) {
      throw new Error("command client was not initialized");
    }

    return this.commandPromise;
  }

  private getSubscriberClient(): Promise<RedisClient> {
    if (!this.subscriberPromise) {
      this.subscriberPromise = this.connectClient();
    }

    if (!this.subscriberPromise) {
      throw new Error("subscriber client was not initialized");
    }

    return this.subscriberPromise;
  }

  private ensureSubscribed(channel: string): Promise<void> {
    const existing = this.subscriptionPromises.get(channel);
    if (existing) {
      return existing;
    }

    if (this.subscribedChannels.has(channel)) {
      return Promise.resolve();
    }

    const subscriptionPromise = this.getSubscriberClient()
      .then((client) =>
        client.subscribe(channel, (message) => {
          this.handleMessage(channel, message);
        }),
      )
      .then(() => {
        this.subscribedChannels.add(channel);
      })
      .catch(() => {
        this.subscribedChannels.delete(channel);
      })
      .finally(() => {
        this.subscriptionPromises.delete(channel);
      });

    this.subscriptionPromises.set(channel, subscriptionPromise);

    return subscriptionPromise;
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    let viewers: PresenceViewer[];

    try {
      viewers = presenceViewerListSchema.parse(JSON.parse(message));
    } catch {
      return;
    }

    const listeners = this.listenersByChannel.get(channel);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(viewers);
    }
  }

  private async publish(projectId: string): Promise<void> {
    const client = await this.getCommandClient();
    const viewers = await this.getViewers(projectId);
    await client.publish(presenceChannel(projectId), JSON.stringify(viewers));
  }

  private async removeViewer(projectId: string, clientId: string): Promise<void> {
    this.clearRemoval(projectId, clientId);

    const client = await this.getCommandClient();
    const batch = client.multi();
    batch.del(viewerKey(projectId, clientId));
    batch.sRem(viewerSetKey(projectId), clientId);
    await batch.exec();
    await this.publish(projectId);
  }

  private async unsubscribe(channel: string): Promise<void> {
    this.subscribedChannels.delete(channel);
    await this.subscriptionPromises.get(channel);

    try {
      const client = await this.getSubscriberClient();
      await client.unsubscribe(channel);
    } catch {
      // Listener bookkeeping is already cleared locally.
    }
  }
}

export class ResilientRedisPresenceStore extends RedisPresenceStore {
  private failedOpen = false;

  private readonly fallback: InMemoryPresenceStore;

  constructor(redisUrl: string, disconnectTtlMs = 5_000) {
    super(redisUrl, disconnectTtlMs);
    this.fallback = new InMemoryPresenceStore(disconnectTtlMs);
  }

  async getViewers(projectId: string): Promise<PresenceViewer[]> {
    if (this.failedOpen) {
      return this.fallback.getViewers(projectId);
    }

    try {
      return await super.getViewers(projectId);
    } catch {
      this.failedOpen = true;
      return this.fallback.getViewers(projectId);
    }
  }

  scheduleRemoval(projectId: string, clientId: string): void {
    try {
      super.scheduleRemoval(projectId, clientId);
    } catch {
      this.failedOpen = true;
    }

    this.fallback.scheduleRemoval(projectId, clientId);
  }

  async subscribe(
    projectId: string,
    listener: PresenceListener,
  ): Promise<() => void> {
    const unsubscribeFallback = await this.fallback.subscribe(projectId, listener);
    let unsubscribePrimary: () => void = () => undefined;

    try {
      unsubscribePrimary = await super.subscribe(projectId, listener);
    } catch {
      this.failedOpen = true;
    }

    return () => {
      unsubscribePrimary();
      unsubscribeFallback();
    };
  }

  async upsertViewer(projectId: string, viewer: PresenceViewer): Promise<void> {
    if (this.failedOpen) {
      await this.fallback.upsertViewer(projectId, viewer);
      return;
    }

    try {
      await super.upsertViewer(projectId, viewer);
    } catch {
      this.failedOpen = true;
      await this.fallback.upsertViewer(projectId, viewer);
    }
  }
}

export function createPresenceStore(options: PresenceOptions = {}): PresenceStore {
  const disconnectTtlMs = options.disconnectTtlMs ?? 5_000;
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;

  if (redisUrl) {
    return new ResilientRedisPresenceStore(redisUrl, disconnectTtlMs);
  }

  return new InMemoryPresenceStore(disconnectTtlMs);
}

export function getPresenceStore(): PresenceStore {
  const runtime = globalThis as GlobalWithPresenceStore;

  if (!runtime[PRESENCE_STORE_KEY]) {
    runtime[PRESENCE_STORE_KEY] = createPresenceStore();
  }

  return runtime[PRESENCE_STORE_KEY]!;
}
