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

describe("mention notification projection", () => {
  beforeAll(async () => {
    await waitForDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it("projects mention notifications from comment events and removes them when mentions disappear", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { POST: appendProjectEvent } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );
    const { GET: getNotifications } = await import(
      "../../app/api/projects/[projectId]/notifications/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Notifications",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const createTask = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_task",
        entityId: "task_ship_demo",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_000,
        expectedVersion: 1,
        action: {
          type: "task.create",
          data: {
            title: "Ship demo",
            status: "todo",
            projectId,
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );
    expect(createTask.status).toBe(201);

    const createComment = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_comment",
        entityId: "comment_1",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_500,
        expectedVersion: 2,
        action: {
          type: "comment.create",
          data: {
            taskId: "task_ship_demo",
            author: "alice",
            content: "Please review this, @bob",
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );
    expect(createComment.status).toBe(201);

    const notificationResponse = await getNotifications(
      new Request(`${BASE_URL}/api/projects/${projectId}/notifications?userId=bob`),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(notificationResponse.status).toBe(200);
    await expect(notificationResponse.json()).resolves.toMatchObject({
      notifications: [
        {
          commentId: "comment_1",
          taskId: "task_ship_demo",
          taskTitle: "Ship demo",
          userId: "bob",
          actorUserId: "alice",
          contentPreview: "Please review this, @bob",
        },
      ],
    });

    const updateComment = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_comment_update",
        entityId: "comment_1",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_001_000,
        expectedVersion: 3,
        action: {
          type: "comment.update",
          data: {
            content: "Please review this later",
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );
    expect(updateComment.status).toBe(201);

    const afterRemovalResponse = await getNotifications(
      new Request(`${BASE_URL}/api/projects/${projectId}/notifications?userId=bob`),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(afterRemovalResponse.status).toBe(200);
    await expect(afterRemovalResponse.json()).resolves.toMatchObject({
      notifications: [],
    });
  });
});
