import { beforeEach, describe, expect, it } from "vitest";

import type { ProjectEvent } from "../../src/shared/types";

function buildEvent(projectId: string, id: string): ProjectEvent {
  return {
    id,
    projectId,
    entityId: `entity-${id}`,
    action: {
      type: "task.create",
      data: {
        title: `Task ${id}`,
        status: "todo",
        projectId,
      },
    },
    version: 1,
    clientId: "client_alpha",
    userId: "alice",
    timestamp: 1_716_000_000_000,
  };
}

describe("in-memory project event bus", () => {
  beforeEach(async () => {
    const { resetProjectEventBusForTests } = await import(
      "../../src/server/realtime/event-bus"
    );
    resetProjectEventBusForTests();
  });

  it("delivers events to subscribers on the same project channel", async () => {
    const { createInMemoryProjectEventBus } = await import(
      "../../src/server/realtime/event-bus"
    );

    const bus = createInMemoryProjectEventBus();
    const received: ProjectEvent[] = [];

    const unsubscribe = bus.subscribe("project_1", (event) => {
      received.push(event);
    });

    bus.publish(buildEvent("project_1", "evt_1"));
    unsubscribe();

    expect(received).toHaveLength(1);
    expect(received[0]?.id).toBe("evt_1");
  });

  it("does not leak events across projects", async () => {
    const { createInMemoryProjectEventBus } = await import(
      "../../src/server/realtime/event-bus"
    );

    const bus = createInMemoryProjectEventBus();
    const received: ProjectEvent[] = [];

    const unsubscribe = bus.subscribe("project_1", (event) => {
      received.push(event);
    });

    bus.publish(buildEvent("project_2", "evt_other"));
    unsubscribe();

    expect(received).toHaveLength(0);
  });
});
