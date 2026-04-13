import { beforeEach, describe, expect, it } from "vitest";

describe("in-memory rate limiter", () => {
  beforeEach(async () => {
    const { resetRateLimiterForTests } = await import(
      "../../src/server/realtime/rate-limiter"
    );
    resetRateLimiterForTests();
  });

  it("allows requests up to the configured limit and then denies with retryAfterMs", async () => {
    const { createInMemoryRateLimiter } = await import(
      "../../src/server/realtime/rate-limiter"
    );

    const limiter = createInMemoryRateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
    });

    await expect(limiter.check("user:alice")).resolves.toMatchObject({
      allowed: true,
    });
    await expect(limiter.check("user:alice")).resolves.toMatchObject({
      allowed: true,
    });

    const denied = await limiter.check("user:alice");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks keys independently", async () => {
    const { createInMemoryRateLimiter } = await import(
      "../../src/server/realtime/rate-limiter"
    );

    const limiter = createInMemoryRateLimiter({
      maxRequests: 1,
      windowMs: 60_000,
    });

    await expect(limiter.check("user:alice")).resolves.toMatchObject({
      allowed: true,
    });
    await expect(limiter.check("user:bob")).resolves.toMatchObject({
      allowed: true,
    });
    await expect(limiter.check("user:alice")).resolves.toMatchObject({
      allowed: false,
    });
  });
});
