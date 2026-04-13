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

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 3_000,
): Promise<string> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  const read = reader.read().then(({ done, value }) => {
    if (done || !value) {
      throw new Error("stream closed before delivering a chunk");
    }

    return new TextDecoder().decode(value);
  });

  return Promise.race([read, timeout]);
}

describe("project SSE stream", () => {
  beforeAll(async () => {
    await waitForDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it("pushes committed events to SSE subscribers", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { GET: openStream } = await import(
      "../../app/api/projects/[projectId]/stream/route"
    );
    const { POST: appendProjectEvent } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Realtime",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const abortController = new AbortController();
    const streamResponse = await openStream(
      new Request(`${BASE_URL}/api/projects/${projectId}/stream`, {
        signal: abortController.signal,
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.body).toBeTruthy();

    const reader = streamResponse.body!.getReader();
    const versionChunk = await readChunk(reader);
    expect(versionChunk).toContain("event: version");

    const appendResponse = await appendProjectEvent(
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
            title: "Ship realtime demo",
            status: "todo",
            projectId,
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(appendResponse.status).toBe(201);

    const eventChunk = await readChunk(reader);
    expect(eventChunk).toContain("event: project-event");
    expect(eventChunk).toContain("\"id\":\"evt_task_create\"");

    abortController.abort();
    await reader.cancel();
  });

  it(
    "broadcasts presence snapshots and removes viewers after the disconnect timeout",
    async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { GET: openStream } = await import(
      "../../app/api/projects/[projectId]/stream/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Presence",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const firstAbortController = new AbortController();
    const secondAbortController = new AbortController();

    const firstStreamResponse = await openStream(
      new Request(
        `${BASE_URL}/api/projects/${projectId}/stream?clientId=client_alpha&userId=alice&location=project`,
        {
          signal: firstAbortController.signal,
        },
      ),
      {
        params: Promise.resolve({ projectId }),
      },
    );
    const secondStreamResponse = await openStream(
      new Request(
        `${BASE_URL}/api/projects/${projectId}/stream?clientId=client_beta&userId=bob&location=project`,
        {
          signal: secondAbortController.signal,
        },
      ),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    const firstReader = firstStreamResponse.body!.getReader();
    const secondReader = secondStreamResponse.body!.getReader();

    await readChunk(firstReader);
    const firstPresenceChunk = await readChunk(firstReader);
    expect(firstPresenceChunk).toContain("event: presence");
    expect(firstPresenceChunk).toContain("\"userId\":\"alice\"");

    await readChunk(secondReader);
    const secondPresenceChunk = await readChunk(secondReader);
    expect(secondPresenceChunk).toContain("event: presence");
    expect(secondPresenceChunk).toContain("\"userId\":\"bob\"");

    const fanoutChunk = await readChunk(firstReader);
    expect(fanoutChunk).toContain("event: presence");
    expect(fanoutChunk).toContain("\"userId\":\"bob\"");

    secondAbortController.abort();
    await secondReader.cancel();

    const removalChunk = await readChunk(firstReader, 7_000);
    expect(removalChunk).toContain("event: presence");
    expect(removalChunk).not.toContain("\"userId\":\"bob\"");

    firstAbortController.abort();
    await firstReader.cancel();
    },
    10_000,
  );
});
