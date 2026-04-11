import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "3010");

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
  },
  webServer: process.env.PLAYWRIGHT_USE_EXISTING_SERVER
    ? undefined
    : {
        command: `bun run build && bun run db:migrate && bun run start -- --hostname 127.0.0.1 --port ${port}`,
        env: {
          ...process.env,
          DATABASE_URL:
            process.env.DATABASE_URL ??
            "postgres://postgres:postgres@localhost:54329/collab_task_system",
          REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
          NODE_ENV: "production",
        },
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
