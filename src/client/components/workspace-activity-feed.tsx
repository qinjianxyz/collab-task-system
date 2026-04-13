"use client";

import type { ActivityItem } from "../sync/activity";

type WorkspaceActivityFeedProps = {
  activity: ActivityItem[];
};

export function WorkspaceActivityFeed({
  activity,
}: WorkspaceActivityFeedProps) {
  return (
    <aside className="panel activity-panel">
      <div className="activity-header">
        <p className="eyebrow">Live Feed</p>
        <h2>Activity</h2>
        <p className="subtle-copy">
          This sidebar is another projection over the same project stream.
        </p>
      </div>

      <div className="activity-list">
        {activity.length > 0 ? (
          activity.map((item) => (
            <div className="activity-item" key={item.id}>
              <strong>{item.actor}</strong>
              <p>{item.summary}</p>
            </div>
          ))
        ) : (
          <p className="subtle-copy">No events yet. Create a task to start the feed.</p>
        )}
      </div>
    </aside>
  );
}
