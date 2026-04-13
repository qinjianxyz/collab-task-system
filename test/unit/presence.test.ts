import { afterEach, describe, expect, it, vi } from "vitest";

import { createPresenceStore } from "../../src/server/realtime/presence";

describe("presence store", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks viewers per project and removes them after the disconnect timeout", () => {
    vi.useFakeTimers();

    const presenceStore = createPresenceStore({
      disconnectTtlMs: 5_000,
    });

    presenceStore.upsertViewer("project_1", {
      clientId: "client_a",
      userId: "alice",
      location: "project",
      connectedAt: 1_716_000_000_000,
    });

    expect(presenceStore.getViewers("project_1")).toEqual([
      expect.objectContaining({
        clientId: "client_a",
        userId: "alice",
      }),
    ]);

    presenceStore.scheduleRemoval("project_1", "client_a");
    vi.advanceTimersByTime(4_999);

    expect(presenceStore.getViewers("project_1")).toHaveLength(1);

    vi.advanceTimersByTime(1);

    expect(presenceStore.getViewers("project_1")).toHaveLength(0);
  });

  it("cancels a scheduled removal when the same client reconnects", () => {
    vi.useFakeTimers();

    const presenceStore = createPresenceStore({
      disconnectTtlMs: 5_000,
    });

    presenceStore.upsertViewer("project_1", {
      clientId: "client_a",
      userId: "alice",
      location: "project",
      connectedAt: 1_716_000_000_000,
    });
    presenceStore.scheduleRemoval("project_1", "client_a");

    vi.advanceTimersByTime(2_000);

    presenceStore.upsertViewer("project_1", {
      clientId: "client_a",
      userId: "alice",
      location: "project",
      connectedAt: 1_716_000_001_000,
    });

    vi.advanceTimersByTime(5_000);

    expect(presenceStore.getViewers("project_1")).toEqual([
      expect.objectContaining({
        clientId: "client_a",
      }),
    ]);
  });
});
