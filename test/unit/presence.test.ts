import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPresenceStore,
  InMemoryPresenceStore,
  RedisPresenceStore,
} from "../../src/server/realtime/presence";

describe("presence store", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("tracks viewers per project and removes them after the disconnect timeout", async () => {
    vi.useFakeTimers();

    const presenceStore = createPresenceStore({
      disconnectTtlMs: 5_000,
    });

    await presenceStore.upsertViewer("project_1", {
      clientId: "client_a",
      userId: "alice",
      location: "project",
      connectedAt: 1_716_000_000_000,
    });

    await expect(presenceStore.getViewers("project_1")).resolves.toEqual([
      expect.objectContaining({
        clientId: "client_a",
        userId: "alice",
      }),
    ]);

    presenceStore.scheduleRemoval("project_1", "client_a");
    vi.advanceTimersByTime(4_999);

    await expect(presenceStore.getViewers("project_1")).resolves.toHaveLength(1);

    vi.advanceTimersByTime(1);

    await vi.runAllTimersAsync();

    await expect(presenceStore.getViewers("project_1")).resolves.toHaveLength(0);
  });

  it("cancels a scheduled removal when the same client reconnects", async () => {
    vi.useFakeTimers();

    const presenceStore = createPresenceStore({
      disconnectTtlMs: 5_000,
    });

    await presenceStore.upsertViewer("project_1", {
      clientId: "client_a",
      userId: "alice",
      location: "project",
      connectedAt: 1_716_000_000_000,
    });
    presenceStore.scheduleRemoval("project_1", "client_a");

    vi.advanceTimersByTime(2_000);

    await presenceStore.upsertViewer("project_1", {
      clientId: "client_a",
      userId: "alice",
      location: "project",
      connectedAt: 1_716_000_001_000,
    });

    vi.advanceTimersByTime(5_000);

    await vi.runAllTimersAsync();

    await expect(presenceStore.getViewers("project_1")).resolves.toEqual([
      expect.objectContaining({
        clientId: "client_a",
      }),
    ]);
  });

  it("defaults to the in-memory store when REDIS_URL is unset", () => {
    const presenceStore = createPresenceStore();

    expect(presenceStore).toBeInstanceOf(InMemoryPresenceStore);
  });

  it("selects the Redis-backed store when REDIS_URL is configured", () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const presenceStore = createPresenceStore();

    expect(presenceStore).toBeInstanceOf(RedisPresenceStore);
  });

  it("fails open to the in-memory store when the redis store errors", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const upsertSpy = vi
      .spyOn(RedisPresenceStore.prototype, "upsertViewer")
      .mockRejectedValue(new Error("redis unavailable"));

    const presenceStore = createPresenceStore();

    await presenceStore.upsertViewer("project_1", {
      clientId: "client_a",
      userId: "alice",
      location: "project",
      connectedAt: 1_716_000_000_000,
    });

    await expect(presenceStore.getViewers("project_1")).resolves.toEqual([
      expect.objectContaining({
        clientId: "client_a",
        userId: "alice",
      }),
    ]);

    upsertSpy.mockRestore();
  });
});
