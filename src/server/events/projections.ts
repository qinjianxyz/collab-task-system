import type { PoolClient } from "pg";

import type { ProjectEvent } from "../../shared/types";

function eventDate(event: ProjectEvent): Date {
  return new Date(event.timestamp);
}

function extractMentions(content: string): string[] {
  const mentions = content.match(/@([a-zA-Z0-9_-]+)/g) ?? [];
  return [...new Set(mentions.map((mention) => mention.slice(1)))];
}

function buildUpdateStatement(
  updates: Record<string, unknown>,
  startingIndex = 1,
): {
  assignments: string[];
  values: unknown[];
  nextIndex: number;
} {
  const assignments: string[] = [];
  const values: unknown[] = [];
  let index = startingIndex;

  for (const [column, value] of Object.entries(updates)) {
    assignments.push(`${column} = $${index}`);
    values.push(value);
    index += 1;
  }

  return {
    assignments,
    values,
    nextIndex: index,
  };
}

export async function applyEventProjection(
  client: PoolClient,
  event: ProjectEvent,
): Promise<void> {
  switch (event.action.type) {
    case "project.create": {
      await client.query(
        `insert into projects (
          id,
          name,
          description,
          metadata,
          current_version,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event.projectId,
          event.action.data.name,
          event.action.data.description ?? null,
          event.action.data.metadata ?? {},
          event.version,
          eventDate(event),
          eventDate(event),
        ],
      );
      return;
    }
    case "project.update": {
      const update = buildUpdateStatement(
        {
          ...(event.action.data.name !== undefined
            ? { name: event.action.data.name }
            : {}),
          ...(event.action.data.description !== undefined
            ? { description: event.action.data.description }
            : {}),
          ...(event.action.data.metadata !== undefined
            ? { metadata: event.action.data.metadata }
            : {}),
          updated_at: eventDate(event),
        },
      );

      await client.query(
        `update projects
            set ${update.assignments.join(", ")}
          where id = $${update.nextIndex}`,
        [...update.values, event.projectId],
      );
      return;
    }
    case "task.create": {
      await client.query(
        `insert into tasks (
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
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          event.entityId,
          event.projectId,
          event.action.data.title,
          event.action.data.status,
          event.action.data.assignedTo ?? [],
          event.action.data.configuration ?? {},
          event.action.data.dependencies ?? [],
          event.action.data.position ?? event.version,
          event.entityVersion ?? 1,
          eventDate(event),
          eventDate(event),
        ],
      );
      return;
    }
    case "task.update": {
      const update = buildUpdateStatement(
        {
          ...(event.action.data.title !== undefined
            ? { title: event.action.data.title }
            : {}),
          ...(event.action.data.status !== undefined
            ? { status: event.action.data.status }
            : {}),
          ...(event.action.data.assignedTo !== undefined
            ? { assigned_to: event.action.data.assignedTo }
            : {}),
          ...(event.action.data.configuration !== undefined
            ? { configuration: event.action.data.configuration }
            : {}),
          ...(event.action.data.dependencies !== undefined
            ? { dependencies: event.action.data.dependencies }
            : {}),
          ...(event.action.data.position !== undefined
            ? { position: event.action.data.position }
            : {}),
          ...(event.entityVersion !== undefined
            ? { entity_version: event.entityVersion }
            : {}),
          updated_at: eventDate(event),
        },
      );

      await client.query(
        `update tasks
            set ${update.assignments.join(", ")}
          where id = $${update.nextIndex}
            and project_id = $${update.nextIndex + 1}`,
        [...update.values, event.entityId, event.projectId],
      );
      return;
    }
    case "task.delete": {
      await client.query("delete from tasks where id = $1 and project_id = $2", [
        event.entityId,
        event.projectId,
      ]);
      return;
    }
    case "comment.create": {
      const mentions = extractMentions(event.action.data.content);

      await client.query(
        `insert into comments (
          id,
          task_id,
          content,
          author,
          mentions,
          entity_version,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          event.entityId,
          event.action.data.taskId,
          event.action.data.content,
          event.action.data.author,
          mentions,
          event.entityVersion ?? 1,
          eventDate(event),
          eventDate(event),
        ],
      );
      return;
    }
    case "comment.update": {
      const mentions = extractMentions(event.action.data.content);

      const commentUpdateParams: unknown[] = [
        event.action.data.content,
        mentions,
        eventDate(event),
      ];

      let commentUpdateSql = `update comments
            set content = $1,
                mentions = $2,
                updated_at = $3`;

      if (event.entityVersion !== undefined) {
        commentUpdateParams.push(event.entityVersion);
        commentUpdateSql += `,\n                entity_version = $${commentUpdateParams.length}`;
      }

      commentUpdateParams.push(event.entityId);
      commentUpdateSql += `\n          where id = $${commentUpdateParams.length}`;

      await client.query(commentUpdateSql, commentUpdateParams);
      return;
    }
    case "comment.delete": {
      await client.query("delete from comments where id = $1", [event.entityId]);
      return;
    }
    case "presence.update":
      return;
  }
}
