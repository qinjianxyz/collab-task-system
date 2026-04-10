import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  DependencyCycleError,
  InvalidStatusTransitionError,
  appendEvent,
  getEventsSince,
  getSnapshot,
  rebuildProjectProjection,
  replayProjectEvents,
} from "../../src/index";
import { closeDatabasePool, getDatabasePool } from "../../src/server/db/client";
import { resetDatabase, waitForDatabase } from "../../src/server/db/testing";

const BASE_TIMESTAMP = 1_716_000_000_000;

async function seedProject(): Promise<void> {
  await appendEvent({
    id: "evt_project_create",
    projectId: "project_1",
    entityId: "project_1",
    action: {
      type: "project.create",
      data: {
        name: "Project 1",
      },
    },
    clientId: "client_1",
    userId: "user_1",
    timestamp: BASE_TIMESTAMP,
    expectedVersion: 0,
  });
}

describe("replay and validation", () => {
  beforeAll(async () => {
    await waitForDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it("returns ordered events after a checkpoint", async () => {
    await seedProject();

    await appendEvent({
      id: "evt_task_1",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create",
        data: {
          title: "Task 1",
          status: "todo",
          projectId: "project_1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 1,
      expectedVersion: 1,
    });

    await appendEvent({
      id: "evt_task_2",
      projectId: "project_1",
      entityId: "task_2",
      action: {
        type: "task.create",
        data: {
          title: "Task 2",
          status: "todo",
          projectId: "project_1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 2,
      expectedVersion: 2,
    });

    const events = await getEventsSince("project_1", 1);
    expect(events.map((event) => event.version)).toEqual([2, 3]);
  });

  it("returns a snapshot that matches pure replay of the same event stream", async () => {
    await seedProject();

    await appendEvent({
      id: "evt_task_1",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create",
        data: {
          title: "Task 1",
          status: "todo",
          projectId: "project_1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 1,
      expectedVersion: 1,
    });

    await appendEvent({
      id: "evt_comment_1",
      projectId: "project_1",
      entityId: "comment_1",
      action: {
        type: "comment.create",
        data: {
          taskId: "task_1",
          content: "hello @teammate",
          author: "user_1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 2,
      expectedVersion: 2,
    });

    const events = await getEventsSince("project_1", 0);
    const snapshot = await getSnapshot("project_1");

    expect(snapshot).toEqual(replayProjectEvents(events));
  });

  it("rebuilds projections from the event log", async () => {
    await seedProject();

    await appendEvent({
      id: "evt_task_1",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create",
        data: {
          title: "Task 1",
          status: "todo",
          projectId: "project_1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 1,
      expectedVersion: 1,
    });

    await getDatabasePool().query("delete from comments");
    await getDatabasePool().query("delete from tasks");
    await getDatabasePool().query("delete from projects where id = $1", [
      "project_1",
    ]);

    const rebuilt = await rebuildProjectProjection("project_1");
    expect(rebuilt?.version).toBe(2);

    const snapshot = await getSnapshot("project_1");
    expect(snapshot.version).toBe(2);
    expect(snapshot.tasks).toHaveLength(1);
  });

  it("rejects dependency cycles", async () => {
    await seedProject();

    await appendEvent({
      id: "evt_task_1",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create",
        data: {
          title: "Task 1",
          status: "todo",
          projectId: "project_1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 1,
      expectedVersion: 1,
    });

    await appendEvent({
      id: "evt_task_2",
      projectId: "project_1",
      entityId: "task_2",
      action: {
        type: "task.create",
        data: {
          title: "Task 2",
          status: "todo",
          projectId: "project_1",
          dependencies: ["task_1"],
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 2,
      expectedVersion: 2,
    });

    await expect(
      appendEvent({
        id: "evt_task_1_update",
        projectId: "project_1",
        entityId: "task_1",
        action: {
          type: "task.update",
          data: {
            dependencies: ["task_2"],
          },
        },
        clientId: "client_1",
        userId: "user_1",
        timestamp: BASE_TIMESTAMP + 3,
        expectedVersion: 3,
      }),
    ).rejects.toBeInstanceOf(DependencyCycleError);
  });

  it("rejects moving a task to in_progress when dependencies are incomplete", async () => {
    await seedProject();

    await appendEvent({
      id: "evt_task_1",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create",
        data: {
          title: "Task 1",
          status: "todo",
          projectId: "project_1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 1,
      expectedVersion: 1,
    });

    await appendEvent({
      id: "evt_task_2",
      projectId: "project_1",
      entityId: "task_2",
      action: {
        type: "task.create",
        data: {
          title: "Task 2",
          status: "todo",
          projectId: "project_1",
          dependencies: ["task_1"],
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 2,
      expectedVersion: 2,
    });

    await expect(
      appendEvent({
        id: "evt_task_2_update",
        projectId: "project_1",
        entityId: "task_2",
        action: {
          type: "task.update",
          data: {
            status: "in_progress",
          },
        },
        clientId: "client_1",
        userId: "user_1",
        timestamp: BASE_TIMESTAMP + 3,
        expectedVersion: 3,
      }),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
  });
});
