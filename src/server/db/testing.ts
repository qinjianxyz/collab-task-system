import { Client } from "pg";

import { closeDatabasePool, getDatabasePool } from "./client";
import { getDatabaseConfig } from "./config";
import { runMigrations } from "./migrate";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDatabase(timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now();
  const { databaseUrl } = getDatabaseConfig();

  while (Date.now() - startedAt < timeoutMs) {
    const client = new Client({
      connectionString: databaseUrl,
    });

    try {
      await client.connect();
      await client.query("select 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await sleep(500);
    }
  }

  throw new Error(`database did not become ready within ${timeoutMs}ms`);
}

export async function resetDatabase(): Promise<void> {
  await closeDatabasePool();
  const pool = getDatabasePool();
  const client = await pool.connect();

  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    client.release();
  }

  await runMigrations();
}
