import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ConcurrencyConflictError,
  appendEvent,
  getProjectVersion,
} from "../../src/index";
import {
  closeDatabasePool,
  getDatabasePool,
} from "../../src/server/db/client";
import {
  resetDatabase,
  waitForDatabase,
} from "../../src/server/db/testing";

const BASE_TIMESTAMP = 1_715_000_000_000;
type AppendedEvent = Awaited<ReturnType<typeof appendEvent>>;

describe("appendEvent", () => {
  beforeAll(async () => {
    await waitForDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it("creates the project projection with version 1", async () => {
    const event = await appendEvent({
      id: "evt_project_create",
      projectId: "project_1",
      entityId: "project_1",
      action: {
        type: "project.create",
        data: {
          name: "Project 1",
          description: "Initial project",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP,
      expectedVersion: 0,
    });

    expect(event.version).toBe(1);
    expect(await getProjectVersion("project_1")).toBe(1);

    const project = await getDatabasePool().query<{
      name: string;
      current_version: number;
    }>("select name, current_version from projects where id = $1", ["project_1"]);

    expect(project.rows[0]).toEqual({
      name: "Project 1",
      current_version: 1,
    });
  });

  it("applies task and comment events to projections transactionally", async () => {
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

    await appendEvent({
      id: "evt_task_create",
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
      id: "evt_comment_create",
      projectId: "project_1",
      entityId: "comment_1",
      action: {
        type: "comment.create",
        data: {
          taskId: "task_1",
          content: "Ship it",
          author: "user_1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 2,
      expectedVersion: 2,
    });

    const task = await getDatabasePool().query<{
      title: string;
      status: string;
    }>("select title, status from tasks where id = $1", ["task_1"]);
    const comment = await getDatabasePool().query<{
      content: string;
      author: string;
    }>("select content, author from comments where id = $1", ["comment_1"]);

    expect(task.rows[0]).toEqual({
      title: "Task 1",
      status: "todo",
    });
    expect(comment.rows[0]).toEqual({
      content: "Ship it",
      author: "user_1",
    });
  });

  it("treats duplicate event ids as idempotent within a project", async () => {
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

    const input = {
      id: "evt_task_create",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create" as const,
        data: {
          title: "Task 1",
          status: "todo" as const,
          projectId: "project_1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: BASE_TIMESTAMP + 1,
      expectedVersion: 1,
    };

    const first = await appendEvent(input);
    const second = await appendEvent(input);

    const tasks = await getDatabasePool().query<{
      count: string;
    }>("select count(*)::text as count from tasks where id = $1", ["task_1"]);

    expect(second).toEqual(first);
    expect(tasks.rows[0]?.count).toBe("1");
  });

  it("rejects stale expectedVersion values", async () => {
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

    await appendEvent({
      id: "evt_task_create",
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

    await expect(
      appendEvent({
        id: "evt_task_create_2",
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
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it("serializes concurrent appends on one project and preserves monotonic versions", async () => {
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

    const results = await Promise.allSettled([
      appendEvent({
        id: "evt_task_a",
        projectId: "project_1",
        entityId: "task_a",
        action: {
          type: "task.create",
          data: {
            title: "Task A",
            status: "todo",
            projectId: "project_1",
          },
        },
        clientId: "client_1",
        userId: "user_1",
        timestamp: BASE_TIMESTAMP + 1,
        expectedVersion: 1,
      }),
      appendEvent({
        id: "evt_task_b",
        projectId: "project_1",
        entityId: "task_b",
        action: {
          type: "task.create",
          data: {
            title: "Task B",
            status: "todo",
            projectId: "project_1",
          },
        },
        clientId: "client_1",
        userId: "user_1",
        timestamp: BASE_TIMESTAMP + 2,
        expectedVersion: 1,
      }),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<AppendedEvent> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConcurrencyConflictError);

    const events = await getDatabasePool().query<{
      version: number;
    }>("select version from events where project_id = $1 order by version", [
      "project_1",
    ]);

    expect(events.rows.map((row) => row.version)).toEqual([1, 2]);
  });
});
