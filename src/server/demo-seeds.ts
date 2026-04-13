import crypto from "node:crypto";

import type { TaskStatus } from "../shared/types";
import { appendEvent } from "./events/event-store";

type SeedResult = {
  finalVersion: number;
  projectId: string;
  projectName: string;
  taskCount: number;
  url: string;
};

type SeedOptions = {
  baseUrl?: string;
};

type ScaleSeedOptions = SeedOptions & {
  taskCount?: number;
};

type DemoTaskDefinition = {
  assignedTo: string[];
  comments?: Array<{
    author: string;
    content: string;
  }>;
  dependencies?: string[];
  description: string;
  key: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: TaskStatus;
  tags: string[];
  title: string;
};

const DEMO_PROJECT_NAME = "Ship Collab Task System";

const DEMO_TASKS: DemoTaskDefinition[] = [
  {
    key: "event-store-api",
    title: "Finalize event store API",
    status: "done",
    assignedTo: ["Ray"],
    priority: "urgent",
    tags: ["backend", "events"],
    description: "Lock the append contract, expectedVersion semantics, and projection writes.",
    comments: [
      {
        author: "Ray",
        content: "Append + projection in one transaction is the non-negotiable core.",
      },
    ],
  },
  {
    key: "sse-catch-up",
    title: "Add SSE stream catch-up",
    status: "done",
    assignedTo: ["Mia"],
    priority: "high",
    tags: ["realtime", "backend"],
    description: "Backfill missed events on reconnect instead of shipping a new snapshot.",
    dependencies: ["event-store-api"],
    comments: [
      {
        author: "Mia",
        content: "@Ray reconnect now preserves lastVersion and replays the missed stream slice.",
      },
    ],
  },
  {
    key: "optimistic-sync-hook",
    title: "Wire optimistic sync hook",
    status: "done",
    assignedTo: ["Jordan"],
    priority: "urgent",
    tags: ["frontend", "sync"],
    description: "Apply local changes instantly, then reconcile against committed events.",
    dependencies: ["event-store-api", "sse-catch-up"],
    comments: [
      {
        author: "Jordan",
        content: "The hook now retries once on 409 with a refreshed version.",
      },
    ],
  },
  {
    key: "two-tab-demo",
    title: "Ship the two-tab demo",
    status: "done",
    assignedTo: ["Ray", "Jordan"],
    priority: "urgent",
    tags: ["demo", "sync"],
    description: "Prove that two browser contexts converge in near real time over SSE.",
    dependencies: ["optimistic-sync-hook"],
    comments: [
      {
        author: "Ray",
        content: "This is the money shot for the evaluator video.",
      },
    ],
  },
  {
    key: "dependency-ux",
    title: "Improve dependency picker UX",
    status: "in_progress",
    assignedTo: ["Ava"],
    priority: "high",
    tags: ["frontend", "ux"],
    description: "Make blocked-by semantics obvious in the composer and task cards.",
    dependencies: ["two-tab-demo"],
    comments: [
      {
        author: "Ava",
        content: "Switching from generic dependencies language to blocked-by copy.",
      },
    ],
  },
  {
    key: "realistic-demo-seed",
    title: "Seed realistic demo project",
    status: "todo",
    assignedTo: ["Noah"],
    priority: "medium",
    tags: ["demo", "data"],
    description: "Create believable tasks, owners, comments, and blockers for the walkthrough.",
    dependencies: ["dependency-ux"],
  },
  {
    key: "scale-benchmark-seed",
    title: "Seed scale benchmark project",
    status: "todo",
    assignedTo: ["Noah"],
    priority: "medium",
    tags: ["scale", "data"],
    description: "Provide a separate large project for virtualization and pagination proof.",
    dependencies: ["sse-catch-up"],
  },
  {
    key: "benchmark-plan",
    title: "Design scale-proof benchmark plan",
    status: "done",
    assignedTo: ["Noah"],
    priority: "medium",
    tags: ["scale", "planning"],
    description: "Define the benchmark scenarios that prove the 2MB-plus constraint is handled honestly.",
    comments: [
      {
        author: "Noah",
        content: "Separate the product demo from the scale proof so neither story gets diluted.",
      },
    ],
  },
  {
    key: "virtualized-list-qa",
    title: "Verify large-list virtualization",
    status: "todo",
    assignedTo: ["Mia"],
    priority: "high",
    tags: ["scale", "frontend", "qa"],
    description: "Check that the long-list experience stays smooth and paged under the benchmark seed.",
    dependencies: ["scale-benchmark-seed", "benchmark-plan"],
  },
  {
    key: "dependency-copy",
    title: "Tune dependency validation copy",
    status: "todo",
    assignedTo: ["Ava"],
    priority: "medium",
    tags: ["ux", "copy"],
    description: "Make blocked transitions and prerequisite language obvious during the walkthrough.",
    dependencies: ["dependency-ux"],
  },
  {
    key: "task-card-metadata",
    title: "Add task-card metadata display",
    status: "todo",
    assignedTo: ["Jordan"],
    priority: "medium",
    tags: ["frontend", "demo"],
    description: "Expose owners, priority, descriptions, and tags so the realistic seed feels like a real backlog.",
    dependencies: ["dependency-ux"],
    comments: [
      {
        author: "Jordan",
        content: "The realistic project needs to show more than titles if we want the evaluator to believe the data.",
      },
    ],
  },
  {
    key: "playwright-suite",
    title: "Write Playwright reliability suite",
    status: "done",
    assignedTo: ["Mia"],
    priority: "high",
    tags: ["qa", "e2e"],
    description: "Cover the two-tab collaboration path and conflict recovery end to end.",
    dependencies: ["two-tab-demo"],
  },
  {
    key: "readme-architecture",
    title: "Rewrite README architecture section",
    status: "in_progress",
    assignedTo: ["Ray"],
    priority: "high",
    tags: ["docs", "architecture"],
    description: "Explain why event sourcing beats CRUD plus polling for this take-home.",
    dependencies: ["two-tab-demo"],
    comments: [
      {
        author: "Ray",
        content: "README should stand on its own after the live demo finishes.",
      },
    ],
  },
  {
    key: "readme-diagrams",
    title: "Capture README architecture diagrams",
    status: "todo",
    assignedTo: ["Ray"],
    priority: "medium",
    tags: ["docs", "demo"],
    description: "Add diagrams and charts that support the Q&A after the live walkthrough.",
    dependencies: ["readme-architecture"],
  },
  {
    key: "runbook",
    title: "Polish demo runbook",
    status: "todo",
    assignedTo: ["Ava"],
    priority: "medium",
    tags: ["docs", "demo"],
    description: "Turn the runbook into a literal operator checklist for recording day.",
    dependencies: ["realistic-demo-seed", "scale-benchmark-seed"],
  },
  {
    key: "video-script",
    title: "Record evaluator walkthrough",
    status: "blocked",
    assignedTo: ["Ray"],
    priority: "high",
    tags: ["demo", "launch"],
    description: "Capture the five-minute walkthrough once the seed projects and docs are ready.",
    dependencies: ["runbook", "readme-architecture", "playwright-suite"],
    comments: [
      {
        author: "Ray",
        content: "Blocked until the README and seed URLs are final.",
      },
    ],
  },
  {
    key: "dry-run",
    title: "Run evaluator dry run",
    status: "blocked",
    assignedTo: ["Ray", "Mia"],
    priority: "high",
    tags: ["demo", "qa"],
    description: "Walk the exact evaluator path from docker compose up to README Q&A with the final seed URLs.",
    dependencies: ["runbook", "video-script", "readme-diagrams", "virtualized-list-qa"],
    comments: [
      {
        author: "Mia",
        content: "Do this once exactly as the evaluator will, without jumping into code first.",
      },
    ],
  },
  {
    key: "public-repo",
    title: "Publish public repo",
    status: "todo",
    assignedTo: ["Ray"],
    priority: "medium",
    tags: ["launch", "oss"],
    description: "Push the polished repo state once the walkthrough assets are stable.",
    dependencies: ["readme-architecture", "video-script"],
  },
];

function buildUrl(projectId: string, baseUrl = "http://localhost:3000"): string {
  return `${baseUrl.replace(/\/$/, "")}/projects/${projectId}`;
}

async function appendProjectCreate(
  projectId: string,
  name: string,
  description: string,
  clientId: string,
  userId: string,
  metadata: Record<string, unknown>,
): Promise<number> {
  await appendEvent({
    id: crypto.randomUUID(),
    projectId,
    entityId: projectId,
    action: {
      type: "project.create",
      data: {
        name,
        description,
        metadata,
      },
    },
    clientId,
    userId,
    timestamp: Date.now(),
    expectedVersion: 0,
  });

  return 1;
}

export async function seedDemoProject(options: SeedOptions = {}): Promise<SeedResult> {
  const clientId = "seed-demo-project";
  const userId = "seed-bot";
  const projectId = crypto.randomUUID();
  let version = await appendProjectCreate(
    projectId,
    DEMO_PROJECT_NAME,
    "A realistic evaluator walkthrough project for shipping the product itself.",
    clientId,
    userId,
    {
      seeded: true,
      seedType: "demo",
    },
  );

  const taskIds = new Map<string, string>();

  for (const [index, task] of DEMO_TASKS.entries()) {
    const taskId = crypto.randomUUID();
    taskIds.set(task.key, taskId);

    await appendEvent({
      id: crypto.randomUUID(),
      projectId,
      entityId: taskId,
      action: {
        type: "task.create",
        data: {
          title: task.title,
          status: task.status,
          projectId,
          assignedTo: task.assignedTo,
          configuration: {
            priority: task.priority,
            description: task.description,
            tags: task.tags,
            customFields: {
              lane: task.tags[0] ?? "general",
            },
          },
          dependencies: (task.dependencies ?? []).map((dependencyKey) => taskIds.get(dependencyKey)!),
          position: index + 1,
        },
      },
      clientId,
      userId,
      timestamp: Date.now(),
      expectedVersion: version,
    });
    version += 1;
  }

  for (const task of DEMO_TASKS) {
    const taskId = taskIds.get(task.key);
    if (!taskId || !task.comments) {
      continue;
    }

    for (const comment of task.comments) {
      await appendEvent({
        id: crypto.randomUUID(),
        projectId,
        entityId: crypto.randomUUID(),
        action: {
          type: "comment.create",
          data: {
            taskId,
            content: comment.content,
            author: comment.author,
          },
        },
        clientId,
        userId,
        timestamp: Date.now(),
        expectedVersion: version,
      });
      version += 1;
    }
  }

  return {
    finalVersion: version,
    projectId,
    projectName: DEMO_PROJECT_NAME,
    taskCount: DEMO_TASKS.length,
    url: buildUrl(projectId, options.baseUrl),
  };
}

export async function seedScaleProject(
  options: ScaleSeedOptions = {},
): Promise<SeedResult> {
  const taskCount = options.taskCount ?? 300;
  const clientId = "seed-scale-project";
  const userId = "seed-bot";
  const projectId = crypto.randomUUID();
  const projectName = `Large Demo Project (${taskCount.toLocaleString()} tasks)`;

  let version = await appendProjectCreate(
    projectId,
    projectName,
    "A large benchmark dataset for scale proof and long-list interaction.",
    clientId,
    userId,
    {
      seeded: true,
      seedType: "scale",
      taskCount,
    },
  );

  const anchorTaskIds: string[] = [];
  const priorities = ["low", "medium", "high", "urgent"] as const;
  const lanes = ["platform", "product", "infra", "design"] as const;
  const statuses = ["todo", "todo", "in_progress", "done"] as const;

  for (let index = 0; index < taskCount; index += 1) {
    const taskNumber = index + 1;
    const taskId = crypto.randomUUID();
    const dependencies =
      taskNumber % 25 === 0 && anchorTaskIds.length > 0
        ? [anchorTaskIds[anchorTaskIds.length - 1]!]
        : [];
    const nextStatus =
      dependencies.length > 0
        ? "todo"
        : statuses[index % statuses.length]!;

    await appendEvent({
      id: crypto.randomUUID(),
      projectId,
      entityId: taskId,
      action: {
        type: "task.create",
        data: {
          title: `Demo Task ${String(taskNumber).padStart(5, "0")}`,
          status: nextStatus,
          projectId,
          assignedTo: [`owner-${(index % 6) + 1}`],
          configuration: {
            priority: priorities[index % priorities.length]!,
            description: `Synthetic task ${taskNumber} for large-list rendering and scale proof.`,
            tags: [lanes[index % lanes.length]!, taskNumber % 2 === 0 ? "frontend" : "backend"],
            customFields: {
              batch: Math.floor(index / 50),
              score: taskNumber,
            },
          },
          dependencies,
          position: taskNumber,
        },
      },
      clientId,
      userId,
      timestamp: Date.now(),
      expectedVersion: version,
    });
    version += 1;

    if (taskNumber % 25 === 0) {
      anchorTaskIds.push(taskId);
    }
  }

  for (const [index, taskId] of anchorTaskIds.slice(0, 12).entries()) {
    await appendEvent({
      id: crypto.randomUUID(),
      projectId,
      entityId: crypto.randomUUID(),
      action: {
        type: "comment.create",
        data: {
          taskId,
          content: `Seeded scale comment ${index + 1}`,
          author: "seed-bot",
        },
      },
      clientId,
      userId,
      timestamp: Date.now(),
      expectedVersion: version,
    });
    version += 1;
  }

  return {
    finalVersion: version,
    projectId,
    projectName,
    taskCount,
    url: buildUrl(projectId, options.baseUrl),
  };
}
