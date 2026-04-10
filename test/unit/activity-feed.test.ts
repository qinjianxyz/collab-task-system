import { describe, expect, it } from "vitest";

import type { ProjectEvent } from "../../src/shared/types";
import { applyActivityEvent, createActivityItem } from "../../src/client/sync/activity";

describe("activity feed", () => {
  it("formats task creation events with the task title", () => {
    const event: ProjectEvent = {
      id: "evt_task_create",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create",
        data: {
          title: "Ship the realtime demo",
          status: "todo",
          projectId: "project_1",
        },
      },
      version: 2,
      clientId: "client_1",
      userId: "alice",
      timestamp: 1_716_000_000_000,
    };

    expect(createActivityItem(event)).toMatchObject({
      version: 2,
      actor: "alice",
      summary: 'created task "Ship the realtime demo"',
    });
  });

  it("formats status updates in human-readable form", () => {
    const event: ProjectEvent = {
      id: "evt_task_update",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.update",
        data: {
          status: "done",
        },
      },
      version: 3,
      clientId: "client_1",
      userId: "alice",
      timestamp: 1_716_000_000_100,
    };

    expect(createActivityItem(event)).toMatchObject({
      summary: "changed task status to done",
    });
  });

  it("keeps the newest activity entries first and trims the feed window", () => {
    const entries = [
      createActivityItem({
        id: "evt_1",
        projectId: "project_1",
        entityId: "task_1",
        action: {
          type: "task.create",
          data: {
            title: "First",
            status: "todo",
            projectId: "project_1",
          },
        },
        version: 2,
        clientId: "client_1",
        userId: "alice",
        timestamp: 1,
      })!,
    ];

    const nextEntries = applyActivityEvent(
      entries,
      {
        id: "evt_2",
        projectId: "project_1",
        entityId: "task_2",
        action: {
          type: "task.create",
          data: {
            title: "Second",
            status: "todo",
            projectId: "project_1",
          },
        },
        version: 3,
        clientId: "client_1",
        userId: "alice",
        timestamp: 2,
      },
      1,
    );

    expect(nextEntries).toHaveLength(1);
    expect(nextEntries[0]?.id).toBe("evt_2");
  });
});
