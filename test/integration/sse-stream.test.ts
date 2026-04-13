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

type SseReader = {
  buffer: string;
  reader: ReadableStreamDefaultReader<Uint8Array>;
};

function createSseReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): SseReader {
  return {
    buffer: "",
    reader,
  };
}

async function readEvent(
  sseReader: SseReader,
  timeoutMs = 3_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const separatorIndex = sseReader.buffer.indexOf("\n\n");
    if (separatorIndex >= 0) {
      const event = sseReader.buffer.slice(0, separatorIndex);
      sseReader.buffer = sseReader.buffer.slice(separatorIndex + 2);
      if (event.trim().length > 0) {
        return event;
      }
      continue;
    }

    const remainingMs = Math.max(deadline - Date.now(), 1);
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), remainingMs);
    });

    const read = sseReader.reader.read().then(({ done, value }) => {
      if (done || !value) {
        throw new Error("stream closed before delivering a chunk");
      }

      sseReader.buffer += new TextDecoder().decode(value);
    });

    await Promise.race([read, timeout]);
  }

  throw new Error(`timed out after ${timeoutMs}ms`);
}

async function readUntilEvent(
  sseReader: SseReader,
  matcher: (event: string) => boolean,
  timeoutMs = 3_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const event = await readEvent(sseReader, Math.max(deadline - Date.now(), 1));
    if (matcher(event)) {
      return event;
    }
  }

  throw new Error(`timed out after ${timeoutMs}ms`);
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

    const reader = createSseReader(streamResponse.body!.getReader());
    const versionChunk = await readEvent(reader);
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

    const eventChunk = await readEvent(reader);
    expect(eventChunk).toContain("event: project-event");
    expect(eventChunk).toContain("\"id\":\"evt_task_create\"");

    abortController.abort();
    await reader.reader.cancel();
  });

  it("returns 422 when opening a stream for a missing project", async () => {
    const { GET: openStream } = await import(
      "../../app/api/projects/[projectId]/stream/route"
    );

    const response = await openStream(
      new Request(`${BASE_URL}/api/projects/missing-project/stream`),
      {
        params: Promise.resolve({ projectId: "missing-project" }),
      },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "domain_error",
      },
    });
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

    const firstReader = createSseReader(firstStreamResponse.body!.getReader());
    const secondReader = createSseReader(secondStreamResponse.body!.getReader());

    await readEvent(firstReader);
    const firstPresenceChunk = await readUntilEvent(
      firstReader,
      (event) => event.includes("event: presence"),
    );
    expect(firstPresenceChunk).toContain("event: presence");
    expect(firstPresenceChunk).toContain("\"userId\":\"alice\"");

    await readEvent(secondReader);
    const secondPresenceChunk = await readUntilEvent(
      secondReader,
      (event) => event.includes("event: presence"),
    );
    expect(secondPresenceChunk).toContain("event: presence");
    expect(secondPresenceChunk).toContain("\"userId\":\"bob\"");

    const fanoutChunk = firstPresenceChunk.includes("\"userId\":\"bob\"")
      ? firstPresenceChunk
      : await readUntilEvent(
          firstReader,
          (event) => event.includes("event: presence") && event.includes("\"userId\":\"bob\""),
        );
    expect(fanoutChunk).toContain("event: presence");
    expect(fanoutChunk).toContain("\"userId\":\"bob\"");

    secondAbortController.abort();
    await secondReader.reader.cancel();

    const removalChunk = await readUntilEvent(
      firstReader,
      (event) => event.includes("event: presence") && !event.includes("\"userId\":\"bob\""),
      7_000,
    );
    expect(removalChunk).toContain("event: presence");
    expect(removalChunk).not.toContain("\"userId\":\"bob\"");

    firstAbortController.abort();
    await firstReader.reader.cancel();
    },
    10_000,
  );
});
