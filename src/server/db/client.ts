import { Pool, type PoolClient } from "pg";

import { getDatabaseConfig } from "./config";

let pool: Pool | undefined;

export function createDatabasePool(): Pool {
  const { databaseUrl } = getDatabaseConfig();

  return new Pool({
    connectionString: databaseUrl,
    max: 10,
  });
}

export function getDatabasePool(): Pool {
  if (!pool) {
    pool = createDatabasePool();
  }

  return pool;
}

export async function closeDatabasePool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = undefined;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
