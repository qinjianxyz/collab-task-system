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

describe("project API routes", () => {
  beforeAll(async () => {
    await waitForDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it("creates a project and returns its first snapshot through the API", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { GET: getSnapshot } = await import(
      "../../app/api/projects/[projectId]/snapshot/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Launchpad",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );

    expect(createResponse.status).toBe(201);
    const createPayload = await createResponse.json();
    expect(createPayload.event.version).toBe(1);
    expect(createPayload.projectId).toBeTruthy();

    const snapshotResponse = await getSnapshot(
      new Request(`${BASE_URL}/api/projects/${createPayload.projectId}/snapshot`),
      {
        params: Promise.resolve({
          projectId: createPayload.projectId,
        }),
      },
    );

    expect(snapshotResponse.status).toBe(200);
    const snapshotPayload = await snapshotResponse.json();
    expect(snapshotPayload.snapshot.project.name).toBe("Launchpad");
    expect(snapshotPayload.snapshot.version).toBe(1);
  });

  it("returns 409 on stale versions and succeeds after retrying with a fresh version", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { GET: getSnapshot } = await import(
      "../../app/api/projects/[projectId]/snapshot/route"
    );
    const { POST: appendProjectEvent } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Conflicts",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const firstWrite = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_task_create",
        entityId: "task_1",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_000,
        expectedVersion: 1,
        action: {
          type: "task.create",
          data: {
            title: "Task 1",
            status: "todo",
            projectId,
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(firstWrite.status).toBe(201);

    const staleWrite = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_task_update_stale",
        entityId: "task_1",
        clientId: "client_beta",
        userId: "bob",
        timestamp: 1_716_000_000_500,
        expectedVersion: 1,
        action: {
          type: "task.update",
          data: {
            status: "in_progress",
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(staleWrite.status).toBe(409);

    const snapshotResponse = await getSnapshot(
      new Request(`${BASE_URL}/api/projects/${projectId}/snapshot`),
      {
        params: Promise.resolve({ projectId }),
      },
    );
    const snapshotPayload = await snapshotResponse.json();

    const retryWrite = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_task_update_retry",
        entityId: "task_1",
        clientId: "client_beta",
        userId: "bob",
        timestamp: 1_716_000_001_000,
        expectedVersion: snapshotPayload.snapshot.version,
        action: {
          type: "task.update",
          data: {
            status: "in_progress",
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(retryWrite.status).toBe(201);

    const finalSnapshotResponse = await getSnapshot(
      new Request(`${BASE_URL}/api/projects/${projectId}/snapshot`),
      {
        params: Promise.resolve({ projectId }),
      },
    );
    const finalSnapshotPayload = await finalSnapshotResponse.json();

    expect(finalSnapshotPayload.snapshot.version).toBe(3);
    expect(finalSnapshotPayload.snapshot.tasks[0]).toMatchObject({
      id: "task_1",
      status: "in_progress",
    });
  });

  it("rejects presence.update through the append API because presence is ephemeral", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { POST: appendProjectEvent } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Presence",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const presenceWrite = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_presence_update",
        entityId: "client_alpha",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_000,
        expectedVersion: 1,
        action: {
          type: "presence.update",
          data: {
            userId: "alice",
            location: "project",
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(presenceWrite.status).toBe(422);
  });

  it("rejects deleting a task that other tasks still depend on", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { POST: appendProjectEvent } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Dependencies",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const createTaskA = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_task_a",
        entityId: "task_a",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_000,
        expectedVersion: 1,
        action: {
          type: "task.create",
          data: {
            title: "Finalize auth",
            status: "done",
            projectId,
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );
    expect(createTaskA.status).toBe(201);

    const createTaskB = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_task_b",
        entityId: "task_b",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_500,
        expectedVersion: 2,
        action: {
          type: "task.create",
          data: {
            title: "Ship dashboard",
            status: "todo",
            projectId,
            dependencies: ["task_a"],
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );
    expect(createTaskB.status).toBe(201);

    const deleteTaskA = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_task_a_delete",
        entityId: "task_a",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_001_000,
        expectedVersion: 3,
        action: {
          type: "task.delete",
          data: {},
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(deleteTaskA.status).toBe(422);
    await expect(deleteTaskA.json()).resolves.toMatchObject({
      error: {
        code: "domain_error",
      },
    });
  });

  it("rejects updating or deleting comments that do not exist", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { POST: appendProjectEvent } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Comments",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const createTask = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_task_comments",
        entityId: "task_comments",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_000,
        expectedVersion: 1,
        action: {
          type: "task.create",
          data: {
            title: "Review copy",
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

    const updateMissingComment = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_comment_missing_update",
        entityId: "comment_missing",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_500,
        expectedVersion: 2,
        action: {
          type: "comment.update",
          data: {
            content: "Edited",
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(updateMissingComment.status).toBe(422);

    const deleteMissingComment = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_comment_missing_delete",
        entityId: "comment_missing",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_001_000,
        expectedVersion: 2,
        action: {
          type: "comment.delete",
          data: {},
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(deleteMissingComment.status).toBe(422);
  });
});
