import { createClient } from "redis";
import { NextResponse } from "next/server";

type RateLimitConfig = {
  limit: number;
  windowMs: number;
  redisUrl?: string;
};

type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

export interface WriteRateLimiter {
  check: (key: string) => Promise<RateLimitDecision>;
}

export class InMemoryWriteRateLimiter implements WriteRateLimiter {
  private readonly state = new Map<string, RateLimitState>();

  constructor(private readonly config: RateLimitConfig) {}

  async check(key: string): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = this.state.get(key);
    const isExpired = !existing || existing.resetAt <= now;
    const nextResetAt = isExpired ? now + this.config.windowMs : existing.resetAt;
    const nextCount = isExpired ? 1 : existing.count + 1;

    this.state.set(key, {
      count: nextCount,
      resetAt: nextResetAt,
    });

    if (nextCount <= this.config.limit) {
      return {
        allowed: true,
        remaining: this.config.limit - nextCount,
        resetAt: nextResetAt,
        retryAfterSeconds: 0,
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt: nextResetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((nextResetAt - now) / 1000)),
    };
  }
}

export class RedisWriteRateLimiter implements WriteRateLimiter {
  private clientPromise: Promise<ReturnType<typeof createClient>> | null = null;

  constructor(private readonly config: RateLimitConfig) {}

  async check(key: string): Promise<RateLimitDecision> {
    const client = await this.getClient();
    const bucketKey = this.bucketKey(key);
    const count = await client.incr(bucketKey);

    if (count === 1) {
      await client.expire(bucketKey, Math.max(1, Math.ceil(this.config.windowMs / 1000)));
    }

    const ttlSeconds = await client.ttl(bucketKey);
    const effectiveTtlSeconds = ttlSeconds >= 0 ? ttlSeconds : Math.max(1, Math.ceil(this.config.windowMs / 1000));
    const resetAt = Date.now() + effectiveTtlSeconds * 1000;

    if (count <= this.config.limit) {
      return {
        allowed: true,
        remaining: this.config.limit - count,
        resetAt,
        retryAfterSeconds: 0,
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, effectiveTtlSeconds),
    };
  }

  private bucketKey(key: string): string {
    return `write-rate-limit:${key}`;
  }

  private getClient(): Promise<ReturnType<typeof createClient>> {
    if (!this.clientPromise) {
      const client = createClient({
        url: this.config.redisUrl,
      });

      client.on("error", () => undefined);
      this.clientPromise = client.connect().then(() => client);
    }

    return this.clientPromise;
  }
}

const RATE_LIMIT_LIMIT = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;

const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  limit: RATE_LIMIT_LIMIT,
  windowMs: RATE_LIMIT_WINDOW_MS,
};

const WRITE_RATE_LIMITER_KEY_CONFIG = Symbol.for(
  "collab-task-system.write-rate-limiter.config",
);

const WRITE_RATE_LIMITER_KEY = Symbol.for("collab-task-system.write-rate-limiter");

type GlobalWithWriteRateLimiter = typeof globalThis & {
  [WRITE_RATE_LIMITER_KEY]?: WriteRateLimiter;
  [WRITE_RATE_LIMITER_KEY_CONFIG]?: string;
};

function readRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  const limit = Number(env.WRITE_RATE_LIMIT_LIMIT ?? RATE_LIMIT_LIMIT);
  const windowMs = Number(env.WRITE_RATE_LIMIT_WINDOW_MS ?? RATE_LIMIT_WINDOW_MS);
  const redisUrl = env.REDIS_URL?.trim();

  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : RATE_LIMIT_LIMIT,
    windowMs:
      Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : RATE_LIMIT_WINDOW_MS,
    ...(redisUrl ? { redisUrl } : {}),
  };
}

export function createWriteRateLimiter(
  options: Partial<RateLimitConfig> = {},
): WriteRateLimiter {
  const config = {
    ...DEFAULT_RATE_LIMIT_CONFIG,
    ...readRateLimitConfig(),
    ...options,
  };

  if (config.redisUrl) {
    return new RedisWriteRateLimiter(config);
  }

  return new InMemoryWriteRateLimiter(config);
}

export function getWriteRateLimiter(): WriteRateLimiter {
  const runtime = globalThis as GlobalWithWriteRateLimiter;
  const config = JSON.stringify(readRateLimitConfig());

  if (!runtime[WRITE_RATE_LIMITER_KEY] || runtime[WRITE_RATE_LIMITER_KEY_CONFIG] !== config) {
    runtime[WRITE_RATE_LIMITER_KEY] = createWriteRateLimiter();
    runtime[WRITE_RATE_LIMITER_KEY_CONFIG] = config;
  }

  return runtime[WRITE_RATE_LIMITER_KEY] ?? createWriteRateLimiter();
}

export function createRateLimitResponse(decision: RateLimitDecision): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "rate_limited",
        message: "too many write requests, please retry later",
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, decision.retryAfterSeconds)),
      },
    },
  );
}
