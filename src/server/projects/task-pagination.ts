import type { PoolClient } from "pg";

import type { Comment, Task } from "../../shared/types";
import { DomainError } from "../domain/errors";
import { withTransaction } from "../db/client";
import { projectTaskPageSchema } from "../../shared/api";
import { BadRequestError } from "../api/errors";
import { taskConfigSchema } from "../../shared/types";

type TaskCursor = {
  position: number;
  id: string;
};

type ProjectRow = {
  id: string;
};

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  status: Task["status"];
  assigned_to: string[] | null;
  configuration: Record<string, unknown> | null;
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
  count: string;
};

function toTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
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

export function encodeTaskCursor(cursor: TaskCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeTaskCursor(rawCursor: string): TaskCursor {
  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")) as {
      id?: unknown;
      position?: unknown;
    };

    if (typeof parsed.id !== "string" || parsed.id.length === 0) {
      throw new Error("cursor id must be a non-empty string");
    }

    if (typeof parsed.position !== "number" || !Number.isFinite(parsed.position)) {
      throw new Error("cursor position must be a finite number");
    }

    return {
      id: parsed.id,
      position: parsed.position,
    };
  } catch {
    throw new BadRequestError("after cursor must be a valid task cursor");
  }
}

export async function readProjectTaskPage(
  client: PoolClient,
  projectId: string,
  {
    after,
    limit,
  }: {
    after?: string | null;
    limit?: number;
  } = {},
): Promise<ReturnType<typeof projectTaskPageSchema.parse>> {
  const pageLimit = limit ?? 100;
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 200) {
    throw new BadRequestError("limit must be an integer between 1 and 200");
  }

  const cursor = after ? decodeTaskCursor(after) : null;

  const projectResult = await client.query<ProjectRow>(
    "select id from projects where id = $1",
    [projectId],
  );

  if (!projectResult.rows[0]) {
    throw new DomainError(`project ${projectId} does not exist`);
  }

  const totalCountResult = await client.query<CountRow>(
    "select count(*)::text as count from tasks where project_id = $1",
    [projectId],
  );

  const taskParams: Array<string | number> = [projectId];
  let taskQuery = `select
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
      where project_id = $1`;

  if (cursor) {
    taskParams.push(cursor.position, cursor.id);
    taskQuery += `
        and (position, id) > ($2, $3)`;
  }

  taskParams.push(pageLimit + 1);
  taskQuery += `
      order by position asc, id asc
      limit $${taskParams.length}`;

  const taskResult = await client.query<TaskRow>(taskQuery, taskParams);
  const hasMore = taskResult.rows.length > pageLimit;
  const visibleTaskRows = taskResult.rows.slice(0, pageLimit);
  const taskIds = visibleTaskRows.map((row) => row.id);

  const commentsResult = taskIds.length
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
          order by created_at asc, id asc`,
        [taskIds],
      )
    : { rows: [] as CommentRow[] };

  const tasks = visibleTaskRows.map(toTask);
  const comments = commentsResult.rows.map(toComment);
  const lastTask = tasks.at(-1);

  return projectTaskPageSchema.parse({
    tasks,
    comments,
    nextCursor: hasMore && lastTask
      ? encodeTaskCursor({
          position: lastTask.position,
          id: lastTask.id,
        })
      : null,
    hasMore,
    totalCount: Number(totalCountResult.rows[0]?.count ?? 0),
  });
}

export async function getProjectTaskPage(
  projectId: string,
  options: {
    after?: string | null;
    limit?: number;
  } = {},
): Promise<ReturnType<typeof projectTaskPageSchema.parse>> {
  const page = await withTransaction((client) =>
    readProjectTaskPage(client, projectId, options),
  );

  return page;
}
