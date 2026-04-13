import type {
  MentionNotification,
  ProjectEvent,
  ProjectSnapshot,
} from "../../shared/types";

function extractMentions(content: string): string[] {
  const mentions = content.match(/@([a-zA-Z0-9_-]+)/g) ?? [];
  return [...new Set(mentions.map((mention) => mention.slice(1)))];
}

function buildNotificationId(projectId: string, commentId: string, userId: string): string {
  return `${projectId}:${commentId}:${userId}`;
}

function buildContentPreview(content: string): string {
  return content.length <= 160 ? content : `${content.slice(0, 157)}...`;
}

export function sortNotifications(
  notifications: MentionNotification[],
): MentionNotification[] {
  return [...notifications].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || right.id.localeCompare(left.id),
  );
}

export function applyNotificationEvent(
  current: MentionNotification[],
  event: ProjectEvent,
  currentUserId: string,
  snapshot: ProjectSnapshot | null,
): MentionNotification[] {
  if (!currentUserId) {
    return current;
  }

  if (event.action.type === "comment.delete") {
    return current.filter((notification) => notification.commentId !== event.entityId);
  }

  if (
    event.action.type !== "comment.create" &&
    event.action.type !== "comment.update"
  ) {
    return current;
  }

  const mentions = extractMentions(event.action.data.content);
  const next = current.filter((notification) => notification.commentId !== event.entityId);

  if (!mentions.includes(currentUserId) || event.userId === currentUserId) {
    return next;
  }

  const taskId =
    event.action.type === "comment.create"
      ? event.action.data.taskId
      : snapshot?.comments.find((comment) => comment.id === event.entityId)?.taskId;
  if (!taskId) {
    return next;
  }

  const taskTitle = snapshot?.tasks.find((task) => task.id === taskId)?.title ?? taskId;

  return sortNotifications([
    {
      id: buildNotificationId(event.projectId, event.entityId, currentUserId),
      projectId: event.projectId,
      taskId,
      taskTitle,
      commentId: event.entityId,
      userId: currentUserId,
      actorUserId:
        event.action.type === "comment.create"
          ? event.action.data.author
          : event.userId,
      contentPreview: buildContentPreview(event.action.data.content),
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
    },
    ...next,
  ]);
}
