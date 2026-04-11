import { createClient } from "redis";

import { getDatabasePool } from "../db/client";
import { getDatabaseConfig } from "../db/config";

type ServiceHealth = {
  message?: string;
  status: "ok" | "skipped" | "error";
};

export type SystemHealth = {
  checkedAt: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
  };
  status: "ok" | "degraded";
};

async function checkDatabase(): Promise<ServiceHealth> {
  try {
    await getDatabasePool().query("select 1");
    return {
      status: "ok",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRedis(redisUrl: string | undefined): Promise<ServiceHealth> {
  if (!redisUrl) {
    return {
      status: "skipped",
      message: "REDIS_URL not configured",
    };
  }

  const client = createClient({
    url: redisUrl,
  });
  client.on("error", () => undefined);

  try {
    await client.connect();
    const response = await client.ping();

    return {
      status: response === "PONG" ? "ok" : "error",
      ...(response === "PONG" ? {} : { message: `unexpected ping response: ${response}` }),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.quit().catch(() => undefined);
  }
}

export async function getSystemHealth(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SystemHealth> {
  const databaseConfig = getDatabaseConfig(env);
  void databaseConfig;

  const [database, redis] = await Promise.all([
    checkDatabase(),
    checkRedis(env.REDIS_URL?.trim()),
  ]);

  const status =
    database.status === "ok" && (redis.status === "ok" || redis.status === "skipped")
      ? "ok"
      : "degraded";

  return {
    checkedAt: new Date().toISOString(),
    services: {
      database,
      redis,
    },
    status,
  };
}
