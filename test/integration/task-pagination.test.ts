import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closeDatabasePool } from "../../src/server/db/client";
import { resetDatabase, waitForDatabase } from "../../src/server/db/testing";

const BASE_URL = "http://localhost:3000";

function createJsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("task pagination route", () => {
  beforeAll(async () => {
    await waitForDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it("returns tasks ordered by position and id with scoped comments and a cursor", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { POST: appendProjectEvent } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );
    const { GET: getTaskPage } = await import(
      "../../app/api/projects/[projectId]/tasks/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Pagination",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const writes = [
      {
        id: "evt_task_b",
        entityId: "task_b",
        timestamp: 1_716_000_000_000,
        expectedVersion: 1,
        action: {
          type: "task.create" as const,
          data: {
            title: "Task B",
            status: "todo" as const,
            projectId,
            position: 10,
          },
        },
      },
      {
        id: "evt_task_a",
        entityId: "task_a",
        timestamp: 1_716_000_000_100,
        expectedVersion: 2,
        action: {
          type: "task.create" as const,
          data: {
            title: "Task A",
            status: "todo" as const,
            projectId,
            position: 10,
          },
        },
      },
      {
        id: "evt_task_c",
        entityId: "task_c",
        timestamp: 1_716_000_000_200,
        expectedVersion: 3,
        action: {
          type: "task.create" as const,
          data: {
            title: "Task C",
            status: "done" as const,
            projectId,
            position: 20,
          },
        },
      },
      {
        id: "evt_comment_a_1",
        entityId: "comment_a_1",
        timestamp: 1_716_000_000_300,
        expectedVersion: 4,
        action: {
          type: "comment.create" as const,
          data: {
            taskId: "task_a",
            content: "Comment for A",
            author: "alice",
          },
        },
      },
      {
        id: "evt_comment_c_1",
        entityId: "comment_c_1",
        timestamp: 1_716_000_000_400,
        expectedVersion: 5,
        action: {
          type: "comment.create" as const,
          data: {
            taskId: "task_c",
            content: "Comment for C",
            author: "alice",
          },
        },
      },
    ];

    for (const write of writes) {
      const response = await appendProjectEvent(
        createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
          ...write,
          clientId: "client_alpha",
          userId: "alice",
        }),
        {
          params: Promise.resolve({ projectId }),
        },
      );

      expect(response.status).toBe(201);
    }

    const firstPageResponse = await getTaskPage(
      new Request(`${BASE_URL}/api/projects/${projectId}/tasks?limit=2`),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(firstPageResponse.status).toBe(200);
    const firstPagePayload = await firstPageResponse.json();

    expect(firstPagePayload.page.totalCount).toBe(3);
    expect(firstPagePayload.page.hasMore).toBe(true);
    expect(firstPagePayload.page.tasks.map((task: { id: string }) => task.id)).toEqual([
      "task_a",
      "task_b",
    ]);
    expect(firstPagePayload.page.tasks[0]).toMatchObject({
      id: "task_a",
      position: 10,
    });
    expect(firstPagePayload.page.comments).toEqual([
      expect.objectContaining({
        id: "comment_a_1",
        taskId: "task_a",
      }),
    ]);
    expect(firstPagePayload.page.nextCursor).toBeTruthy();

    const secondPageResponse = await getTaskPage(
      new Request(
        `${BASE_URL}/api/projects/${projectId}/tasks?limit=2&after=${encodeURIComponent(firstPagePayload.page.nextCursor)}`,
      ),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(secondPageResponse.status).toBe(200);
    const secondPagePayload = await secondPageResponse.json();

    expect(secondPagePayload.page.totalCount).toBe(3);
    expect(secondPagePayload.page.hasMore).toBe(false);
    expect(secondPagePayload.page.nextCursor).toBeNull();
    expect(secondPagePayload.page.tasks.map((task: { id: string }) => task.id)).toEqual([
      "task_c",
    ]);
    expect(secondPagePayload.page.comments).toEqual([
      expect.objectContaining({
        id: "comment_c_1",
        taskId: "task_c",
      }),
    ]);
  });

  it("rejects invalid pagination query parameters", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { GET: getTaskPage } = await import(
      "../../app/api/projects/[projectId]/tasks/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Pagination Errors",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const invalidLimitResponse = await getTaskPage(
      new Request(`${BASE_URL}/api/projects/${projectId}/tasks?limit=0`),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(invalidLimitResponse.status).toBe(400);
    await expect(invalidLimitResponse.json()).resolves.toMatchObject({
      error: {
        code: "bad_request",
      },
    });

    const invalidCursorResponse = await getTaskPage(
      new Request(`${BASE_URL}/api/projects/${projectId}/tasks?after=not-base64`),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(invalidCursorResponse.status).toBe(400);
    await expect(invalidCursorResponse.json()).resolves.toMatchObject({
      error: {
        code: "bad_request",
      },
    });

    const invalidProjectResponse = await getTaskPage(
      new Request(`${BASE_URL}/api/projects/missing/tasks`),
      {
        params: Promise.resolve({ projectId: "missing" }),
      },
    );

    expect(invalidProjectResponse.status).toBe(422);
    await expect(invalidProjectResponse.json()).resolves.toMatchObject({
      error: {
        code: "domain_error",
      },
    });
  });
});
