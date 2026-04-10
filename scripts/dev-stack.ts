import { spawnSync } from "node:child_process";

type CommandName = "up" | "down";

const POSTGRES_CONTAINER = "collab-task-system-postgres";
const POSTGRES_VOLUME = "collab-task-system-postgres-data";

function run(command: string, args: string[], allowFailure = false): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }
}

function hasDockerComposePlugin(): boolean {
  const result = spawnSync("docker", ["compose", "version"], {
    stdio: "ignore",
  });

  return result.status === 0;
}

function upWithFallback(): void {
  run("docker", ["rm", "-f", POSTGRES_CONTAINER], true);

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
    "postgres:17",
  ]);
}

function downWithFallback(): void {
  run("docker", ["rm", "-f", POSTGRES_CONTAINER], true);
}

function main(): void {
  const command = process.argv[2] as CommandName | undefined;

  if (command !== "up" && command !== "down") {
    process.stderr.write("Usage: tsx scripts/dev-stack.ts <up|down>\n");
    process.exit(1);
  }

  if (hasDockerComposePlugin()) {
    if (command === "up") {
      run("docker", ["compose", "up", "-d", "postgres"]);
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
