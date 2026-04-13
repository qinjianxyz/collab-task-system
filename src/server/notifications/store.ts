import { withTransaction } from "../db/client";
import type { MentionNotification } from "../../shared/types";

type NotificationRow = {
  id: string;
  project_id: string;
  task_id: string;
  task_title: string;
  comment_id: string;
  user_id: string;
  actor_user_id: string;
  content_preview: string;
  created_at: Date;
  updated_at: Date;
};

function toMentionNotification(row: NotificationRow): MentionNotification {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    commentId: row.comment_id,
    userId: row.user_id,
    actorUserId: row.actor_user_id,
    contentPreview: row.content_preview,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

export async function listProjectNotifications(
  projectId: string,
  userId: string,
  limit = 20,
): Promise<MentionNotification[]> {
  const result = await withTransaction((client) =>
    client.query<NotificationRow>(
      `select
          id,
          project_id,
          task_id,
          task_title,
          comment_id,
          user_id,
          actor_user_id,
          content_preview,
          created_at,
          updated_at
        from notifications
        where project_id = $1
          and user_id = $2
        order by updated_at desc, id desc
        limit $3`,
      [projectId, userId, limit],
    ),
  );

  return result.rows.map(toMentionNotification);
}
