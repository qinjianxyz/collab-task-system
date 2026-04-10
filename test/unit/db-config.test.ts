import { describe, expect, it } from "vitest";

import { getDatabaseConfig } from "../../src/server/db/config";

describe("getDatabaseConfig", () => {
  it("falls back to the local postgres URL in development", () => {
    expect(
      getDatabaseConfig({
        NODE_ENV: "development",
      }).databaseUrl,
    ).toBe("postgres://postgres:postgres@localhost:54329/collab_task_system");
  });

  it("throws in production when DATABASE_URL is missing", () => {
    expect(() =>
      getDatabaseConfig({
        NODE_ENV: "production",
      }),
    ).toThrowError("DATABASE_URL must be set when NODE_ENV=production");
  });

  it("uses the explicit DATABASE_URL in production", () => {
    expect(
      getDatabaseConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://postgres:postgres@db:5432/collab_task_system",
      }).databaseUrl,
    ).toBe("postgres://postgres:postgres@db:5432/collab_task_system");
  });
});
