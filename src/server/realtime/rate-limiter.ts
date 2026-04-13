type RateLimitResult =
  | {
      allowed: true;
      retryAfterMs: 0;
    }
  | {
      allowed: false;
      retryAfterMs: number;
    };

export type RateLimiter = {
  check: (key: string) => Promise<RateLimitResult>;
  dispose?: () => Promise<void>;
};

type InMemoryRateLimiterOptions = {
  maxRequests: number;
  windowMs: number;
};

const WRITE_RATE_LIMITER_KEY = Symbol.for("collab-task-system.write-rate-limiter");
let hasWarnedAboutRedisRateLimiter = false;

type GlobalWithRateLimiter = typeof globalThis & {
  [WRITE_RATE_LIMITER_KEY]?: RateLimiter;
};

type InMemoryBucket = {
  count: number;
  resetsAt: number;
};

const DEFAULT_MAX_REQUESTS = 120;
const DEFAULT_WINDOW_MS = 60_000;

export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function createInMemoryRateLimiter(
  options: InMemoryRateLimiterOptions,
): RateLimiter {
  const buckets = new Map<string, InMemoryBucket>();

  return {
    async check(key) {
      const now = Date.now();
      const bucket = buckets.get(key);

      if (!bucket || bucket.resetsAt <= now) {
        buckets.set(key, {
          count: 1,
          resetsAt: now + options.windowMs,
        });

        return {
          allowed: true,
          retryAfterMs: 0,
        };
      }

      if (bucket.count >= options.maxRequests) {
        return {
          allowed: false,
          retryAfterMs: Math.max(bucket.resetsAt - now, 1),
        };
      }

      bucket.count += 1;

      return {
        allowed: true,
        retryAfterMs: 0,
      };
    },
  };
}

export function createRedisRateLimiter(
  options: InMemoryRateLimiterOptions & {
    redisUrl: string;
  },
): RateLimiter {
  let clientPromise: Promise<{
    incr: (key: string) => Promise<number>;
    pExpire: (key: string, ttlMs: number) => Promise<unknown>;
    pTTL: (key: string) => Promise<number>;
    quit: () => Promise<unknown>;
  }> | null = null;

  async function getClient() {
    if (!clientPromise) {
      clientPromise = import("redis").then(async ({ createClient }) => {
        const client = createClient({ url: options.redisUrl });
        client.on("error", () => undefined);
        await client.connect();
        return client;
      });
    }

    return clientPromise;
  }

  return {
    async check(key) {
      const namespacedKey = `collab-task-system:rate-limit:${key}`;
      const client = await getClient();
      const count = await client.incr(namespacedKey);

      if (count === 1) {
        await client.pExpire(namespacedKey, options.windowMs);
      }

      if (count > options.maxRequests) {
        return {
          allowed: false,
          retryAfterMs: Math.max(await client.pTTL(namespacedKey), 1),
        };
      }

      return {
        allowed: true,
        retryAfterMs: 0,
      };
    },
    async dispose() {
      const client = await clientPromise?.catch(() => null);
      await client?.quit().catch(() => undefined);
    },
  };
}

export function getWriteRateLimiter(env: NodeJS.ProcessEnv = process.env): RateLimiter {
  const runtime = globalThis as GlobalWithRateLimiter;

  if (!runtime[WRITE_RATE_LIMITER_KEY]) {
    const redisUrl = env.REDIS_URL?.trim();

    if (redisUrl) {
      try {
        runtime[WRITE_RATE_LIMITER_KEY] = createRedisRateLimiter({
          maxRequests: DEFAULT_MAX_REQUESTS,
          redisUrl,
          windowMs: DEFAULT_WINDOW_MS,
        });
      } catch (error) {
        if (!hasWarnedAboutRedisRateLimiter) {
          console.warn("falling back to in-memory rate limiter", error);
          hasWarnedAboutRedisRateLimiter = true;
        }
        runtime[WRITE_RATE_LIMITER_KEY] = createInMemoryRateLimiter({
          maxRequests: DEFAULT_MAX_REQUESTS,
          windowMs: DEFAULT_WINDOW_MS,
        });
      }
    } else {
      runtime[WRITE_RATE_LIMITER_KEY] = createInMemoryRateLimiter({
        maxRequests: DEFAULT_MAX_REQUESTS,
        windowMs: DEFAULT_WINDOW_MS,
      });
    }
  }

  return runtime[WRITE_RATE_LIMITER_KEY]!;
}

export function resetRateLimiterForTests(): void {
  const runtime = globalThis as GlobalWithRateLimiter;
  void runtime[WRITE_RATE_LIMITER_KEY]?.dispose?.();
  delete runtime[WRITE_RATE_LIMITER_KEY];
}
