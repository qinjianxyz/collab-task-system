import { closeDatabasePool } from "../src/server/db/client";
import { waitForDatabase } from "../src/server/db/testing";
import { appendEvent } from "../src/server/events/event-store";

const DEFAULT_TASK_COUNT = 10_000;
const PROGRESS_EVERY = 500;

function readTaskCount(): number {
  const parsed = Number.parseInt(process.env.TASK_COUNT ?? String(DEFAULT_TASK_COUNT), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("TASK_COUNT must be a positive integer");
  }

  return parsed;
}

function priorityFor(index: number): "low" | "medium" | "high" | "urgent" {
  if (index % 17 === 0) {
    return "urgent";
  }

  if (index % 9 === 0) {
    return "high";
  }

  if (index % 4 === 0) {
    return "medium";
  }

  return "low";
}

async function main(): Promise<void> {
  await waitForDatabase();

  const taskCount = readTaskCount();
  const startedAt = Date.now();
  const projectId = crypto.randomUUID();
  const clientId = "seed-script";
  const userId = "seedbot";

  await appendEvent({
    id: crypto.randomUUID(),
    projectId,
    entityId: projectId,
    action: {
      type: "project.create",
      data: {
        name: process.env.PROJECT_NAME ?? `Large Project ${taskCount}`,
        description: `Synthetic project seeded with ${taskCount} tasks`,
        metadata: {
          seededAt: new Date(startedAt).toISOString(),
          taskCount,
        },
      },
    },
    clientId,
    userId,
    timestamp: startedAt,
    expectedVersion: 0,
  });

  for (let index = 1; index <= taskCount; index += 1) {
    await appendEvent({
      id: crypto.randomUUID(),
      projectId,
      entityId: `task_seed_${projectId}_${index}`,
      action: {
        type: "task.create",
        data: {
          title: `Seed task ${index}`,
          status: index % 11 === 0 ? "in_progress" : "todo",
          projectId,
          position: index,
          configuration: {
            priority: priorityFor(index),
            description: `Synthetic task ${index} for scale verification`,
            tags: [`batch-${Math.floor(index / 100)}`],
            customFields: {
              synthetic: true,
              ordinal: index,
            },
          },
        },
      },
      clientId,
      userId,
      timestamp: startedAt + index,
      expectedVersion: index,
    });

    if (index % PROGRESS_EVERY === 0 || index === taskCount) {
      process.stdout.write(
        `seeded ${index}/${taskCount} tasks for project ${projectId}\n`,
      );
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      durationMs: Date.now() - startedAt,
      projectId,
      taskCount,
    })}\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabasePool();
  });
