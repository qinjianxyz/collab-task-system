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
});
