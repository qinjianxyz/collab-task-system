import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { getDatabaseConfig } from "../../src/server/db/config";
import { runMigrations } from "../../src/server/db/migrate";
import { waitForDatabase } from "../../src/server/db/testing";

describe("runMigrations", () => {
  const client = new Client({
    connectionString: getDatabaseConfig().databaseUrl,
  });

  beforeAll(async () => {
    await waitForDatabase();
    await client.connect();
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  });

  afterAll(async () => {
    await client.end();
  });

  it("creates the required tables and hash partitioned events table", async () => {
    await runMigrations();

    const tables = await client.query<{
      table_name: string;
    }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name in ('projects', 'tasks', 'comments', 'events')
        order by table_name`,
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "comments",
      "events",
      "projects",
      "tasks",
    ]);

    const partition = await client.query<{
      partition_strategy: string;
    }>(
      `select pt.partstrat as partition_strategy
         from pg_partitioned_table pt
         join pg_class c on c.oid = pt.partrelid
        where c.relname = 'events'`,
    );

    expect(partition.rows[0]?.partition_strategy).toBe("h");
  });
});
