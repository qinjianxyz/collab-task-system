import { z } from "zod";

const DEFAULT_DATABASE_URL =
  "postgres://postgres:postgres@localhost:54329/collab_task_system";

const databaseUrlSchema = z.string().min(1);

export type DatabaseConfig = {
  databaseUrl: string;
};

export function getDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return {
      databaseUrl: databaseUrlSchema.parse(databaseUrl),
    };
  }

  if (env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be set when NODE_ENV=production");
  }

  return {
    databaseUrl: DEFAULT_DATABASE_URL,
  };
}
