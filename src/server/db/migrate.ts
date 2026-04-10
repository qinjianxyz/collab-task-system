import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { getDatabasePool, closeDatabasePool } from "./client";

async function ensureMigrationTable(): Promise<void> {
  await getDatabasePool().query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getPendingMigrationFiles(): Promise<string[]> {
  const migrationsDirectory = fileURLToPath(
    new URL("../../../drizzle", import.meta.url),
  );
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const { rows } = await getDatabasePool().query<{ name: string }>(
    "select name from schema_migrations",
  );
  const applied = new Set(rows.map((row) => row.name));

  return files.filter((file) => !applied.has(file));
}

export async function runMigrations(): Promise<string[]> {
  await ensureMigrationTable();

  const pendingFiles = await getPendingMigrationFiles();

  for (const fileName of pendingFiles) {
    const sql = await readFile(
      fileURLToPath(new URL(`../../../drizzle/${fileName}`, import.meta.url)),
      "utf8",
    );

    const client = await getDatabasePool().connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (name) values ($1)",
        [fileName],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return pendingFiles;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(async () => {
      await closeDatabasePool();
    })
    .catch(async (error) => {
      await closeDatabasePool();
      throw error;
    });
}
