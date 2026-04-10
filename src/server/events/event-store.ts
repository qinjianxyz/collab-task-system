import type { DatabaseError, PoolClient } from "pg";

import {
  appendEventInputSchema,
  type AppendEventInput,
  type EventAction,
  type ProjectEvent,
  type TaskStatus,
} from "../../shared/types";
import {
  ConcurrencyConflictError,
  DependencyCycleError,
  DomainError,
} from "../domain/errors";
import { detectDependencyCycle } from "../domain/dependencies";
import { assertTaskStatusTransitionAllowed } from "../domain/transitions";
import { withTransaction } from "../db/client";

import { applyEventProjection } from "./projections";

type EventRow = {
  id: string;
  project_id: string;
  entity_id: string;
  action_type: EventAction["type"];
  action_data: Record<string, unknown>;
  version: number;
  client_id: string;
  user_id: string;
  timestamp_ms: string | number;
  parent_version: number | null;
};

function toProjectEvent(row: EventRow): ProjectEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    entityId: row.entity_id,
    action: {
      type: row.action_type,
      data: row.action_data,
    } as EventAction,
    version: row.version,
    clientId: row.client_id,
    userId: row.user_id,
    timestamp: Number(row.timestamp_ms),
    parentVersion: row.parent_version ?? undefined,
  };
}

async function findExistingEvent(
  client: PoolClient,
  projectId: string,
  eventId: string,
): Promise<ProjectEvent | null> {
  const existing = await client.query<EventRow>(
    `select
        id,
        project_id,
        entity_id,
        action_type,
        action_data,
        version,
        client_id,
        user_id,
        timestamp_ms,
        parent_version
      from events
      where project_id = $1
        and id = $2`,
    [projectId, eventId],
  );

  return existing.rows[0] ? toProjectEvent(existing.rows[0]) : null;
}

async function insertEvent(
  client: PoolClient,
  event: ProjectEvent,
): Promise<void> {
  await client.query(
    `insert into events (
      id,
      project_id,
      entity_id,
      action_type,
      action_data,
      version,
      client_id,
      user_id,
      timestamp_ms,
      parent_version
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      event.id,
      event.projectId,
      event.entityId,
      event.action.type,
      event.action.data,
      event.version,
      event.clientId,
      event.userId,
      event.timestamp,
      event.parentVersion ?? null,
    ],
  );
}

function isUniqueViolation(error: unknown): error is DatabaseError {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function toStoredEvent(input: AppendEventInput, version: number): ProjectEvent {
  return {
    id: input.id,
    projectId: input.projectId,
    entityId: input.entityId,
    action: input.action,
    version,
    clientId: input.clientId,
    userId: input.userId,
    timestamp: input.timestamp,
    parentVersion: input.parentVersion,
  };
}

export async function appendEvent(input: AppendEventInput): Promise<ProjectEvent> {
  const parsed = appendEventInputSchema.parse(input);

  if (parsed.action.type === "presence.update") {
    throw new DomainError("presence.update is ephemeral and cannot be appended");
  }

  return withTransaction(async (client) => {
    const existingEvent = await findExistingEvent(client, parsed.projectId, parsed.id);
    if (existingEvent) {
      return existingEvent;
    }

    if (parsed.action.type === "project.create") {
      const existingProject = await client.query<{ current_version: number }>(
        "select current_version from projects where id = $1",
        [parsed.projectId],
      );

      if ((existingProject.rowCount ?? 0) > 0 || parsed.expectedVersion !== 0) {
        throw new ConcurrencyConflictError(
          "project.create expectedVersion must be 0 for a new project",
        );
      }

      const event = toStoredEvent(parsed, 1);

      try {
        await insertEvent(client, event);
      } catch (error) {
        if (isUniqueViolation(error)) {
          const duplicate = await findExistingEvent(client, parsed.projectId, parsed.id);
          if (duplicate) {
            return duplicate;
          }
        }

        throw error;
      }

      await applyEventProjection(client, event);
      return event;
    }

    const project = await client.query<{ current_version: number }>(
      "select current_version from projects where id = $1 for update",
      [parsed.projectId],
    );

    if (project.rowCount === 0) {
      throw new DomainError(`project ${parsed.projectId} does not exist`);
    }

    const currentVersion = project.rows[0]!.current_version;
    if (currentVersion !== parsed.expectedVersion) {
      throw new ConcurrencyConflictError(
        `expected version ${parsed.expectedVersion}, found ${currentVersion}`,
      );
    }

    await validateTaskEvent(client, parsed);

    const event = toStoredEvent(parsed, currentVersion + 1);

    try {
      await insertEvent(client, event);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const duplicate = await findExistingEvent(client, parsed.projectId, parsed.id);
        if (duplicate) {
          return duplicate;
        }
      }

      throw error;
    }

    await applyEventProjection(client, event);
    await client.query(
      `update projects
          set current_version = $1,
              updated_at = $2
        where id = $3`,
      [event.version, new Date(event.timestamp), event.projectId],
    );

    return event;
  });
}

export async function getProjectVersion(projectId: string): Promise<number> {
  const result = await withTransaction(async (client) =>
    client.query<{ current_version: number }>(
      "select current_version from projects where id = $1",
      [projectId],
    ),
  );

  return result.rows[0]?.current_version ?? 0;
}

export async function getEventsSince(
  projectId: string,
  version: number,
): Promise<ProjectEvent[]> {
  const result = await withTransaction(async (client) =>
    client.query<EventRow>(
      `select
          id,
          project_id,
          entity_id,
          action_type,
          action_data,
          version,
          client_id,
          user_id,
          timestamp_ms,
          parent_version
        from events
        where project_id = $1
          and version > $2
        order by version asc`,
      [projectId, version],
    ),
  );

  return result.rows.map(toProjectEvent);
}

type TaskStateRow = {
  title: string;
  id: string;
  status: TaskStatus;
  dependencies: string[] | null;
};

async function validateTaskEvent(
  client: PoolClient,
  input: AppendEventInput,
): Promise<void> {
  if (input.action.type !== "task.create" && input.action.type !== "task.update") {
    return;
  }

  const taskRows = await client.query<TaskStateRow>(
    `select id, title, status, dependencies
       from tasks
      where project_id = $1`,
    [input.projectId],
  );

  const tasksById = new Map(
    taskRows.rows.map((row) => [
      row.id,
      {
        title: row.title,
        status: row.status,
        dependencies: row.dependencies ?? [],
      },
    ]),
  );

  const dependencyGraph = Object.fromEntries(
    taskRows.rows.map((row) => [row.id, row.dependencies ?? []]),
  );

  const nextDependencies =
    input.action.type === "task.create"
      ? input.action.data.dependencies ?? []
      : input.action.data.dependencies ??
        tasksById.get(input.entityId)?.dependencies ??
        [];

  const nextStatus =
    input.action.type === "task.create"
      ? input.action.data.status
      : input.action.data.status ??
        tasksById.get(input.entityId)?.status ??
        "todo";

  if (input.action.type === "task.create" && input.action.data.projectId !== input.projectId) {
    throw new DomainError("task.create projectId must match the event projectId");
  }

  if (
    input.action.type === "task.update" &&
    !tasksById.has(input.entityId)
  ) {
    throw new DomainError(`task ${input.entityId} does not exist`);
  }

  if (detectDependencyCycle(dependencyGraph, input.entityId, nextDependencies)) {
    throw new DependencyCycleError(
      `task ${input.entityId} would introduce a dependency cycle`,
    );
  }

  const dependencyStates = nextDependencies.map((dependencyId) => {
    const task = tasksById.get(dependencyId);
    if (!task) {
      throw new DomainError(`dependency ${dependencyId} does not exist`);
    }

    return {
      id: dependencyId,
      status: task.status,
      title: task.title,
    };
  });

  assertTaskStatusTransitionAllowed(nextStatus, dependencyStates);
}
