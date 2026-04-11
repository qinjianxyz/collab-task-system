import { spawnSync } from "node:child_process";

type CommandName = "up" | "down";

const POSTGRES_CONTAINER = "collab-task-system-postgres";
const POSTGRES_VOLUME = "collab-task-system-postgres-data";
const REDIS_CONTAINER = "collab-task-system-redis";
const SERVICE_STARTUP_TIMEOUT_MS = 60_000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(command: string, args: string[], allowFailure = false): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }
}

function capture(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function hasDockerComposePlugin(): boolean {
  const result = spawnSync("docker", ["compose", "version"], {
    stdio: "ignore",
  });

  return result.status === 0;
}

function waitForContainerHealth(
  containerRef: string,
  timeoutMs = SERVICE_STARTUP_TIMEOUT_MS,
): void {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = spawnSync("docker", [
      "inspect",
      "--format",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
      containerRef,
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });

    const status = result.status === 0 ? result.stdout.trim() : "";

    if (status === "healthy" || status === "running") {
      return;
    }

    sleep(1_000);
  }

  process.stderr.write(
    `Timed out waiting for container ${containerRef} to become healthy.\n`,
  );
  process.exit(1);
}

function waitForComposeService(service: string): void {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SERVICE_STARTUP_TIMEOUT_MS) {
    const containerId = capture("docker", ["compose", "ps", "-q", service]);

    if (containerId) {
      waitForContainerHealth(containerId);
      return;
    }

    sleep(1_000);
  }

  process.stderr.write(`Unable to resolve container for service ${service}.\n`);
  process.exit(1);
}

function upWithFallback(): void {
  run("docker", ["rm", "-f", POSTGRES_CONTAINER], true);
  run("docker", ["rm", "-f", REDIS_CONTAINER], true);

  run("docker", [
    "run",
    "-d",
    "--name",
    POSTGRES_CONTAINER,
    "-e",
    "POSTGRES_DB=collab_task_system",
    "-e",
    "POSTGRES_USER=postgres",
    "-e",
    "POSTGRES_PASSWORD=postgres",
    "-p",
    "54329:5432",
    "-v",
    `${POSTGRES_VOLUME}:/var/lib/postgresql/data`,
    "--health-cmd",
    "pg_isready -U postgres -d collab_task_system",
    "--health-interval",
    "5s",
    "--health-timeout",
    "5s",
    "--health-retries",
    "10",
    "postgres:17",
  ]);

  run("docker", [
    "run",
    "-d",
    "--name",
    REDIS_CONTAINER,
    "-p",
    "6379:6379",
    "--health-cmd",
    "redis-cli ping",
    "--health-interval",
    "5s",
    "--health-timeout",
    "5s",
    "--health-retries",
    "10",
    "redis:7-alpine",
    "redis-server",
    "--save",
    "",
    "--appendonly",
    "no",
  ]);

  waitForContainerHealth(POSTGRES_CONTAINER);
  waitForContainerHealth(REDIS_CONTAINER);
}

function downWithFallback(): void {
  run("docker", ["rm", "-f", POSTGRES_CONTAINER], true);
  run("docker", ["rm", "-f", REDIS_CONTAINER], true);
}

function main(): void {
  const command = process.argv[2] as CommandName | undefined;

  if (command !== "up" && command !== "down") {
    process.stderr.write("Usage: tsx scripts/dev-stack.ts <up|down>\n");
    process.exit(1);
  }

  if (hasDockerComposePlugin()) {
    if (command === "up") {
      run("docker", ["compose", "up", "-d", "postgres", "redis"]);
      waitForComposeService("postgres");
      waitForComposeService("redis");
      return;
    }

    run("docker", ["compose", "down", "-v"]);
    return;
  }

  if (command === "up") {
    upWithFallback();
    return;
  }

  downWithFallback();
}

main();
