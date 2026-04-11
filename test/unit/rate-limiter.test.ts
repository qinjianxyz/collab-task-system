import { afterEach, describe, expect, it, vi } from "vitest";

describe("write rate limiter", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("tracks per-key fixed windows in memory", async () => {
    const { createWriteRateLimiter } = await import(
      "../../src/server/realtime/rate-limiter"
    );

    const limiter = createWriteRateLimiter({
      limit: 2,
      windowMs: 1_000,
    });

    const first = await limiter.check("project:create:client_alpha");
    const second = await limiter.check("project:create:client_alpha");
    const third = await limiter.check("project:create:client_alpha");

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("selects the redis-backed limiter when REDIS_URL is configured", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const { createWriteRateLimiter, RedisWriteRateLimiter } = await import(
      "../../src/server/realtime/rate-limiter"
    );

    const limiter = createWriteRateLimiter({
      limit: 2,
      windowMs: 1_000,
    });

    expect(limiter).toBeInstanceOf(RedisWriteRateLimiter);
  });

  it("fails open to the in-memory limiter when the redis limiter errors", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const rateLimiterModule = await import(
      "../../src/server/realtime/rate-limiter"
    );
    const checkSpy = vi
      .spyOn(rateLimiterModule.RedisWriteRateLimiter.prototype, "check")
      .mockRejectedValue(new Error("redis unavailable"));

    const limiter = rateLimiterModule.createWriteRateLimiter({
      limit: 1,
      windowMs: 1_000,
    });

    const first = await limiter.check("project:create:client_alpha");
    const second = await limiter.check("project:create:client_alpha");

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);

    checkSpy.mockRestore();
  });
});
