import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { closeDatabasePool, getDatabasePool } from "../../src/server/db/client";
import { waitForDatabase } from "../../src/server/db/testing";
import { runMigrations } from "../../src/server/db/migrate";
import type { ProjectEvent } from "../../src/shared/types";

const BASE_URL = "http://localhost:3000";

function resetRealtimeSingletons(): void {
  const runtime = globalThis as typeof globalThis & Record<symbol, unknown>;

  delete runtime[Symbol.for("collab-task-system.project-event-bus")];
  delete runtime[Symbol.for("collab-task-system.project-event-bus.emitter")];
  delete runtime[Symbol.for("collab-task-system.presence-store")];
}

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
    await runMigrations();
  });

  beforeEach(async () => {
    const pool = getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query("delete from comments");
      await client.query("delete from tasks");
      await client.query("delete from events");
      await client.query("delete from projects");
    } finally {
      client.release();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetRealtimeSingletons();
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

  it("recovers missed events after a disconnect via the events-since API", async () => {
    const { POST: createProject } = await import("../../app/api/projects/route");
    const { GET: openStream } = await import(
      "../../app/api/projects/[projectId]/stream/route"
    );
    const { POST: appendProjectEvent, GET: getEventsSince } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Reconnect",
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
    const reader = streamResponse.body!.getReader();

    await readChunk(reader);

    await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_reconnect_1",
        entityId: "task_reconnect_1",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_100,
        expectedVersion: 1,
        action: {
          type: "task.create",
          data: {
            title: "Reconnect 1",
            status: "todo",
            projectId,
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    const firstEventChunk = await readChunk(reader);
    expect(firstEventChunk).toContain("\"id\":\"evt_reconnect_1\"");

    abortController.abort();
    await reader.cancel();

    await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_reconnect_2",
        entityId: "task_reconnect_2",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_101,
        expectedVersion: 2,
        action: {
          type: "task.create",
          data: {
            title: "Reconnect 2",
            status: "todo",
            projectId,
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_reconnect_3",
        entityId: "task_reconnect_3",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_102,
        expectedVersion: 3,
        action: {
          type: "task.create",
          data: {
            title: "Reconnect 3",
            status: "todo",
            projectId,
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    const recoveryResponse = await getEventsSince(
      new Request(`${BASE_URL}/api/projects/${projectId}/events?since=2`),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(recoveryResponse.status).toBe(200);
    const recoveryPayload = await recoveryResponse.json();
    expect(recoveryPayload.events.map((event: ProjectEvent) => event.version)).toEqual([3, 4]);
  });

  it("keeps the stream open when Redis-backed presence initialization fails", async () => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    resetRealtimeSingletons();

    const { POST: createProject } = await import("../../app/api/projects/route");
    const { GET: openStream } = await import(
      "../../app/api/projects/[projectId]/stream/route"
    );
    const { RedisPresenceStore } = await import(
      "../../src/server/realtime/presence"
    );

    vi.spyOn(RedisPresenceStore.prototype, "upsertViewer").mockImplementation(
      async () => {
        throw new Error("redis unavailable");
      },
    );
    vi.spyOn(RedisPresenceStore.prototype, "getViewers").mockImplementation(
      async () => {
        throw new Error("redis unavailable");
      },
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Presence fallback",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const abortController = new AbortController();
    const streamResponse = await openStream(
      new Request(
        `${BASE_URL}/api/projects/${projectId}/stream?clientId=client_alpha&userId=alice&location=project`,
        {
          signal: abortController.signal,
        },
      ),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(streamResponse.status).toBe(200);
    const reader = streamResponse.body!.getReader();

    const versionChunk = await readChunk(reader);
    expect(versionChunk).toContain("event: version");

    const presenceChunk = await readChunk(reader);
    expect(presenceChunk).toContain("event: presence");
    expect(presenceChunk).toContain("\"userId\":\"alice\"");

    abortController.abort();
    await reader.cancel();
  });

  it("delivers events locally when Redis publish fails after subscribe", async () => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    resetRealtimeSingletons();

    const { POST: createProject } = await import("../../app/api/projects/route");
    const { GET: openStream } = await import(
      "../../app/api/projects/[projectId]/stream/route"
    );
    const { POST: appendProjectEvent } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );
    const { RedisProjectEventBus } = await import(
      "../../src/server/realtime/event-bus"
    );

    vi.spyOn(RedisProjectEventBus.prototype, "publish").mockImplementation(() => {
      throw new Error("redis unavailable");
    });

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Bus fallback",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );
    const { projectId } = await createResponse.json();

    const abortController = new AbortController();
    const streamResponse = await openStream(
      new Request(
        `${BASE_URL}/api/projects/${projectId}/stream?clientId=client_alpha&userId=alice&location=project`,
        {
          signal: abortController.signal,
        },
      ),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    const reader = streamResponse.body!.getReader();
    await readChunk(reader);
    await readChunk(reader);

    const appendResponse = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_bus_fallback",
        entityId: "task_1",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_900,
        expectedVersion: 1,
        action: {
          type: "task.create",
          data: {
            title: "Fallback publish",
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
    expect(eventChunk).toContain("\"id\":\"evt_bus_fallback\"");

    abortController.abort();
    await reader.cancel();
  });

  it("recovers through events-since after a closed stream misses events", async () => {
    vi.stubEnv("SSE_BUFFER_LIMIT", "1");
    resetRealtimeSingletons();

    const { POST: createProject } = await import("../../app/api/projects/route");
    const { GET: openStream } = await import(
      "../../app/api/projects/[projectId]/stream/route"
    );
    const { POST: appendProjectEvent, GET: getEventsSince } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );

    const createResponse = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Recovery",
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

    const reader = streamResponse.body!.getReader();
    const versionChunk = await readChunk(reader);
    expect(versionChunk).toContain("event: version");

    await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_recovery_1",
        entityId: "task_recovery_1",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_001_000,
        expectedVersion: 1,
        action: {
          type: "task.create",
          data: {
            title: "Recovery 1",
            status: "todo",
            projectId,
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    abortController.abort();
    await reader.cancel();

    await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/${projectId}/events`, "POST", {
        id: "evt_recovery_2",
        entityId: "task_recovery_2",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_001_001,
        expectedVersion: 2,
        action: {
          type: "task.create",
          data: {
            title: "Recovery 2",
            status: "todo",
            projectId,
          },
        },
      }),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    const recoveryResponse = await getEventsSince(
      new Request(`${BASE_URL}/api/projects/${projectId}/events?since=1`),
      {
        params: Promise.resolve({ projectId }),
      },
    );

    expect(recoveryResponse.status).toBe(200);
    const recoveryPayload = await recoveryResponse.json();
    expect(recoveryPayload.events.map((event: ProjectEvent) => event.version)).toEqual([2, 3]);
  });
});

describe("project event bus", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("defaults to an in-memory bus when REDIS_URL is unset", async () => {
    const { createProjectEventBus, InMemoryProjectEventBus } = await import(
      "../../src/server/realtime/event-bus"
    );

    const bus = createProjectEventBus();

    expect(bus).toBeInstanceOf(InMemoryProjectEventBus);

    const received: ProjectEvent[] = [];
    const unsubscribe = bus.subscribe("project_123", (event) => {
      received.push(event);
    });

    bus.publish({
      id: "evt_bus_publish",
      projectId: "project_123",
      entityId: "task_123",
      action: {
        type: "task.create",
        data: {
          projectId: "project_123",
          status: "todo",
          title: "Bus test",
        },
      },
      clientId: "client_alpha",
      userId: "alice",
      timestamp: 1_716_000_000_000,
      version: 1,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      id: "evt_bus_publish",
      projectId: "project_123",
    });

    unsubscribe();
  });

  it("selects the Redis bus when REDIS_URL is configured", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const { createProjectEventBus, RedisProjectEventBus } = await import(
      "../../src/server/realtime/event-bus"
    );

    const bus = createProjectEventBus();

    expect(bus).toBeInstanceOf(RedisProjectEventBus);
  });

  it("fails open to local delivery when the redis bus cannot subscribe or publish", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const eventBusModule = await import("../../src/server/realtime/event-bus");
    const publishSpy = vi
      .spyOn(eventBusModule.RedisProjectEventBus.prototype, "publish")
      .mockImplementation(() => {
        throw new Error("redis unavailable");
      });
    const subscribeSpy = vi
      .spyOn(eventBusModule.RedisProjectEventBus.prototype, "subscribe")
      .mockImplementation(() => {
        throw new Error("redis unavailable");
      });

    const bus = eventBusModule.createProjectEventBus();
    const received: ProjectEvent[] = [];
    const unsubscribe = bus.subscribe("project_123", (event) => {
      received.push(event);
    });

    bus.publish({
      id: "evt_bus_fallback",
      projectId: "project_123",
      entityId: "task_123",
      action: {
        type: "task.create",
        data: {
          projectId: "project_123",
          status: "todo",
          title: "Fallback bus test",
        },
      },
      clientId: "client_alpha",
      userId: "alice",
      timestamp: 1_716_000_000_000,
      version: 1,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      id: "evt_bus_fallback",
    });

    unsubscribe();
    publishSpy.mockRestore();
    subscribeSpy.mockRestore();
  });
});
