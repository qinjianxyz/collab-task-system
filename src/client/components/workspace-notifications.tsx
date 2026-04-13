"use client";

import type { MentionNotification } from "../../shared/types";

type WorkspaceNotificationsProps = {
  notifications: MentionNotification[];
};

export function WorkspaceNotifications({
  notifications,
}: WorkspaceNotificationsProps) {
  return (
    <aside className="panel notifications-panel">
      <div className="activity-header">
        <p className="eyebrow">Mentions</p>
        <h2>Notifications</h2>
      </div>

      <div className="activity-list">
        {notifications.length > 0 ? (
          notifications.map((notification) => (
            <div className="activity-item" key={notification.id}>
              <strong>{notification.actorUserId}</strong>
              <p>
                mentioned you on <strong>{notification.taskTitle}</strong>
              </p>
              <p>{notification.contentPreview}</p>
            </div>
          ))
        ) : (
          <p className="subtle-copy">
            No mentions yet. Comments with @your-name appear here.
          </p>
        )}
      </div>
    </aside>
  );
}
