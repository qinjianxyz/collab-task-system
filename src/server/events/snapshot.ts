import type { PoolClient } from "pg";

import {
  type PagedProjectSnapshot,
  type ProjectTaskPage,
  taskConfigSchema,
  type Comment,
  type Project,
  type ProjectSnapshot,
  type Task,
} from "../../shared/types";
import { DomainError } from "../domain/errors";
import { replayProjectEvents } from "../domain/replay";
import { BadRequestError } from "../api/errors";
import { withTransaction } from "../db/client";

import { getEventsSince } from "./event-store";
import { applyEventProjection } from "./projections";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  current_version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  status: Task["status"];
  assigned_to: string[] | null;
  configuration: Record<string, unknown>;
  dependencies: string[] | null;
  position: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type CommentRow = {
  id: string;
  task_id: string;
  content: string;
  author: string;
  mentions: string[] | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type CountRow = {
  task_count: number | string;
};

type TaskCursorPayload = {
  id: string;
  position: number;
};

type TaskPageOptions = {
  after?: string | null;
  taskLimit?: number;
};

export const DEFAULT_TASK_PAGE_SIZE = 100;
export const MAX_TASK_PAGE_SIZE = 250;

function toTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function sortSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    ...snapshot,
    tasks: [...snapshot.tasks].sort(
      (left, right) => left.position - right.position || left.id.localeCompare(right.id),
    ),
    comments: [...snapshot.comments].sort(
      (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
    ),
  };
}

function normalizeTaskLimit(limit?: number): number {
  if (limit === undefined) {
    return DEFAULT_TASK_PAGE_SIZE;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TASK_PAGE_SIZE) {
    throw new BadRequestError(
      `taskLimit must be an integer between 1 and ${MAX_TASK_PAGE_SIZE}`,
    );
  }

  return limit;
}

function encodeTaskCursor(task: Pick<TaskRow, "id" | "position">): string {
  return Buffer.from(
    JSON.stringify({
      id: task.id,
      position: task.position,
    } satisfies TaskCursorPayload),
    "utf8",
  ).toString("base64url");
}

function decodeTaskCursor(cursor: string): TaskCursorPayload {
  try {
    const payload = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<TaskCursorPayload>;

    if (
      typeof payload.id !== "string" ||
      payload.id.length === 0 ||
      typeof payload.position !== "number" ||
      !Number.isFinite(payload.position)
    ) {
      throw new Error("invalid task cursor payload");
    }

    return {
      id: payload.id,
      position: payload.position,
    };
  } catch {
    throw new BadRequestError("after must be a valid task cursor");
  }
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    assignedTo: row.assigned_to ?? [],
    configuration: taskConfigSchema.parse(row.configuration ?? {}),
    dependencies: row.dependencies ?? [],
    position: row.position,
    createdAt: toTimestampMs(row.created_at),
    updatedAt: toTimestampMs(row.updated_at),
  };
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    taskId: row.task_id,
    content: row.content,
    author: row.author,
    mentions: row.mentions ?? [],
    createdAt: toTimestampMs(row.created_at),
    updatedAt: toTimestampMs(row.updated_at),
  };
}

async function queryTaskPage(
  client: PoolClient,
  projectId: string,
  options: TaskPageOptions = {},
): Promise<ProjectTaskPage> {
  const taskLimit = normalizeTaskLimit(options.taskLimit);

  const countResult = await client.query<CountRow>(
    `select count(*)::int as task_count
      from tasks
      where project_id = $1`,
    [projectId],
  );

  const totalCount = Number(countResult.rows[0]?.task_count ?? 0);
  const afterCursor = options.after ? decodeTaskCursor(options.after) : null;

  const tasksResult = afterCursor
    ? await client.query<TaskRow>(
        `select
            id,
            project_id,
            title,
            status,
            assigned_to,
            configuration,
            dependencies,
            position,
            created_at,
            updated_at
          from tasks
          where project_id = $1
            and (
              position > $2
              or (position = $2 and id > $3)
            )
          order by position, id
          limit $4`,
        [projectId, afterCursor.position, afterCursor.id, taskLimit + 1],
      )
    : await client.query<TaskRow>(
        `select
            id,
            project_id,
            title,
            status,
            assigned_to,
            configuration,
            dependencies,
            position,
            created_at,
            updated_at
          from tasks
          where project_id = $1
          order by position, id
          limit $2`,
        [projectId, taskLimit + 1],
      );

  const hasMore = tasksResult.rows.length > taskLimit;
  const taskRows = tasksResult.rows.slice(0, taskLimit);
  const taskIds = taskRows.map((row) => row.id);

  const commentsResult =
    taskIds.length > 0
      ? await client.query<CommentRow>(
          `select
              id,
              task_id,
              content,
              author,
              mentions,
              created_at,
              updated_at
            from comments
            where task_id = any($1::text[])
            order by created_at, id`,
          [taskIds],
        )
      : { rows: [] };

  return {
    tasks: taskRows.map(toTask),
    comments: commentsResult.rows.map(toComment),
    nextCursor: hasMore ? encodeTaskCursor(taskRows[taskRows.length - 1]!) : null,
    hasMore,
    totalCount,
  };
}

export async function getTaskPage(
  projectId: string,
  options: TaskPageOptions = {},
): Promise<ProjectTaskPage> {
  return withTransaction(async (client) => queryTaskPage(client, projectId, options));
}

export async function getSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const { projectRow, tasksRows, commentsRows } = await withTransaction(async (client) => {
    const projectResult = await client.query<ProjectRow>(
      `select
          id,
          name,
          description,
          metadata,
          current_version,
          created_at,
          updated_at
        from projects
        where id = $1`,
      [projectId],
    );

    const projectRow = projectResult.rows[0];
    if (!projectRow) {
      throw new DomainError(`project ${projectId} does not exist`);
    }

    const tasksResult = await client.query<TaskRow>(
      `select
          id,
          project_id,
          title,
          status,
          assigned_to,
          configuration,
          dependencies,
          position,
          created_at,
          updated_at
        from tasks
        where project_id = $1
        order by position, id`,
      [projectId],
    );

    const commentsResult = await client.query<CommentRow>(
      `select
          c.id,
          c.task_id,
          c.content,
          c.author,
          c.mentions,
          c.created_at,
          c.updated_at
        from comments c
        join tasks t on t.id = c.task_id
        where t.project_id = $1
        order by c.created_at, c.id`,
      [projectId],
    );

    return {
      projectRow,
      tasksRows: tasksResult.rows,
      commentsRows: commentsResult.rows,
    };
  });

  const project: Project = {
    id: projectRow.id,
    name: projectRow.name,
    description: projectRow.description ?? undefined,
    metadata: projectRow.metadata ?? {},
    currentVersion: projectRow.current_version,
    createdAt: toTimestampMs(projectRow.created_at),
    updatedAt: toTimestampMs(projectRow.updated_at),
  };

  const tasks: Task[] = tasksRows.map(toTask);

  const comments: Comment[] = commentsRows.map(toComment);

  return sortSnapshot({
    project,
    tasks,
    comments,
    version: project.currentVersion,
  });
}

export async function getPagedSnapshot(
  projectId: string,
  options: TaskPageOptions = {},
): Promise<PagedProjectSnapshot & ProjectSnapshot> {
  const { projectRow, taskPage } = await withTransaction(async (client) => {
    const projectResult = await client.query<ProjectRow>(
      `select
          id,
          name,
          description,
          metadata,
          current_version,
          created_at,
          updated_at
        from projects
        where id = $1`,
      [projectId],
    );

    const projectRow = projectResult.rows[0];
    if (!projectRow) {
      throw new DomainError(`project ${projectId} does not exist`);
    }

    const taskPage = await queryTaskPage(client, projectId, options);

    return {
      projectRow,
      taskPage,
    };
  });

  const project: Project = {
    id: projectRow.id,
    name: projectRow.name,
    description: projectRow.description ?? undefined,
    metadata: projectRow.metadata ?? {},
    currentVersion: projectRow.current_version,
    createdAt: toTimestampMs(projectRow.created_at),
    updatedAt: toTimestampMs(projectRow.updated_at),
  };

  return {
    project,
    tasks: taskPage.tasks,
    comments: taskPage.comments,
    version: project.currentVersion,
    taskPage,
  };
}

async function replaceProjectProjection(
  client: PoolClient,
  projectId: string,
): Promise<void> {
  await client.query(
    `delete from comments
      where task_id in (
        select id from tasks where project_id = $1
      )`,
    [projectId],
  );
  await client.query("delete from tasks where project_id = $1", [projectId]);
  await client.query("delete from projects where id = $1", [projectId]);
}

export async function rebuildProjectProjection(
  projectId: string,
): Promise<ProjectSnapshot | null> {
  const events = await getEventsSince(projectId, 0);
  if (events.length === 0) {
    return null;
  }

  await withTransaction(async (client) => {
    await replaceProjectProjection(client, projectId);

    for (const event of events) {
      await applyEventProjection(client, event);

      if (event.action.type !== "project.create") {
        await client.query(
          `update projects
              set current_version = $1,
                  updated_at = $2
            where id = $3`,
          [event.version, new Date(event.timestamp), projectId],
        );
      }
    }
  });

  return sortSnapshot(replayProjectEvents(events));
}
