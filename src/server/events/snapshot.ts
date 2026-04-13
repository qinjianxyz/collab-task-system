import type { PoolClient } from "pg";

import {
  taskConfigSchema,
  type Comment,
  type Project,
  type ProjectSnapshot,
  type Task,
} from "../../shared/types";
import { DomainError } from "../domain/errors";
import { replayProjectEvents } from "../domain/replay";
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
  entity_version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type CommentRow = {
  id: string;
  task_id: string;
  content: string;
  author: string;
  mentions: string[] | null;
  entity_version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

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
          entity_version,
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
          c.entity_version,
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

  const tasks: Task[] = tasksRows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    assignedTo: row.assigned_to ?? [],
    configuration: taskConfigSchema.parse(row.configuration ?? {}),
    dependencies: row.dependencies ?? [],
    position: row.position,
    entityVersion: row.entity_version,
    createdAt: toTimestampMs(row.created_at),
    updatedAt: toTimestampMs(row.updated_at),
  }));

  const comments: Comment[] = commentsRows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    content: row.content,
    author: row.author,
    mentions: row.mentions ?? [],
    entityVersion: row.entity_version,
    createdAt: toTimestampMs(row.created_at),
    updatedAt: toTimestampMs(row.updated_at),
  }));

  return sortSnapshot({
    project,
    tasks,
    comments,
    version: project.currentVersion,
  });
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
