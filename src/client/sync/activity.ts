import type { ProjectEvent } from "../../shared/types";

export type ActivityItem = {
  id: string;
  version: number;
  timestamp: number;
  actor: string;
  summary: string;
};

function summarizeComment(content: string): string {
  const normalized = content.trim().replace(/\s+/g, " ");
  if (normalized.length <= 48) {
    return normalized;
  }

  return `${normalized.slice(0, 45)}...`;
}

export function createActivityItem(event: ProjectEvent): ActivityItem | null {
  switch (event.action.type) {
    case "project.create":
      return {
        id: event.id,
        version: event.version,
        timestamp: event.timestamp,
        actor: event.userId,
        summary: `created project "${event.action.data.name}"`,
      };
    case "project.update":
      return {
        id: event.id,
        version: event.version,
        timestamp: event.timestamp,
        actor: event.userId,
        summary: "updated the project",
      };
    case "task.create":
      return {
        id: event.id,
        version: event.version,
        timestamp: event.timestamp,
        actor: event.userId,
        summary: `created task "${event.action.data.title}"`,
      };
    case "task.update":
      return {
        id: event.id,
        version: event.version,
        timestamp: event.timestamp,
        actor: event.userId,
        summary:
          event.action.data.status !== undefined
            ? `changed task status to ${event.action.data.status}`
            : event.action.data.title !== undefined
              ? `renamed task to "${event.action.data.title}"`
              : "updated a task",
      };
    case "task.delete":
      return {
        id: event.id,
        version: event.version,
        timestamp: event.timestamp,
        actor: event.userId,
        summary: "deleted a task",
      };
    case "comment.create":
      return {
        id: event.id,
        version: event.version,
        timestamp: event.timestamp,
        actor: event.userId,
        summary: `commented "${summarizeComment(event.action.data.content)}"`,
      };
    case "comment.update":
      return {
        id: event.id,
        version: event.version,
        timestamp: event.timestamp,
        actor: event.userId,
        summary: "edited a comment",
      };
    case "comment.delete":
      return {
        id: event.id,
        version: event.version,
        timestamp: event.timestamp,
        actor: event.userId,
        summary: "deleted a comment",
      };
    case "presence.update":
      return null;
  }
}

export function applyActivityEvent(
  items: ActivityItem[],
  event: ProjectEvent,
  limit = 50,
): ActivityItem[] {
  const nextItem = createActivityItem(event);
  if (!nextItem) {
    return items;
  }

  return [nextItem, ...items.filter((item) => item.id !== nextItem.id)].slice(0, limit);
}

export function buildActivityFeed(
  events: ProjectEvent[],
  limit = 50,
): ActivityItem[] {
  return events.reduce<ActivityItem[]>(
    (items, event) => applyActivityEvent(items, event, limit),
    [],
  );
}
