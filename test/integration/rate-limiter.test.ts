import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("write route rate limiting", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../src/server/realtime/rate-limiter");
  });

  it("returns 429 from project creation when the write limiter denies the request", async () => {
    vi.doMock(
      "../../src/server/realtime/rate-limiter",
      async (importOriginal) => {
        const actual = await importOriginal<typeof import("../../src/server/realtime/rate-limiter")>();

        return {
          ...actual,
          getWriteRateLimiter: () => ({
            check: vi.fn().mockResolvedValue({
              allowed: false,
              retryAfterMs: 4_000,
            }),
          }),
        };
      },
    );

    const { POST: createProject } = await import("../../app/api/projects/route");

    const response = await createProject(
      createJsonRequest(`${BASE_URL}/api/projects`, "POST", {
        name: "Rate Limited",
        clientId: "client_alpha",
        userId: "alice",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("4");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "rate_limited",
      },
    });
  });

  it("returns 429 from event append when the write limiter denies the request", async () => {
    vi.doMock(
      "../../src/server/realtime/rate-limiter",
      async (importOriginal) => {
        const actual = await importOriginal<typeof import("../../src/server/realtime/rate-limiter")>();

        return {
          ...actual,
          getWriteRateLimiter: () => ({
            check: vi.fn().mockResolvedValue({
              allowed: false,
              retryAfterMs: 2_500,
            }),
          }),
        };
      },
    );

    const { POST: appendProjectEvent } = await import(
      "../../app/api/projects/[projectId]/events/route"
    );

    const response = await appendProjectEvent(
      createJsonRequest(`${BASE_URL}/api/projects/project_1/events`, "POST", {
        id: "evt_rate_limit",
        entityId: "task_1",
        clientId: "client_alpha",
        userId: "alice",
        timestamp: 1_716_000_000_000,
        expectedVersion: 1,
        action: {
          type: "task.create",
          data: {
            title: "Blocked by limiter",
            status: "todo",
            projectId: "project_1",
          },
        },
      }),
      {
        params: Promise.resolve({ projectId: "project_1" }),
      },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "rate_limited",
      },
    });
  });
});
