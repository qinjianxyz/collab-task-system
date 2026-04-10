import { describe, expect, it } from "vitest";

import type { ProjectEvent, ProjectSnapshot } from "../../src/shared/types";
import { createHistoryEntry } from "../../src/client/sync/history";

const baseSnapshot: ProjectSnapshot = {
  project: {
    id: "project_1",
    name: "Launchpad",
    currentVersion: 1,
    createdAt: 1_716_000_000_000,
    updatedAt: 1_716_000_000_000,
    metadata: {},
  },
  tasks: [
    {
      id: "task_1",
      projectId: "project_1",
      title: "Ship phase 2",
      status: "todo",
      assignedTo: [],
      configuration: {
        tags: [],
        customFields: {},
      },
      dependencies: [],
      position: 1,
      createdAt: 1_716_000_000_100,
      updatedAt: 1_716_000_000_100,
    },
  ],
  comments: [],
  version: 1,
};

describe("createHistoryEntry", () => {
  it("creates delete/create pairs for task creation", () => {
    const committedEvent: ProjectEvent = {
      id: "evt_task_create",
      projectId: "project_1",
      entityId: "task_2",
      action: {
        type: "task.create",
        data: {
          title: "Document the architecture",
          status: "todo",
          projectId: "project_1",
        },
      },
      version: 2,
      clientId: "client_1",
      userId: "alice",
      timestamp: 1_716_000_000_200,
    };

    const historyEntry = createHistoryEntry(baseSnapshot, committedEvent);

    expect(historyEntry).toMatchObject({
      targetVersion: 2,
      undoAction: {
        entityId: "task_2",
        action: {
          type: "task.delete",
        },
      },
      redoAction: {
        entityId: "task_2",
        action: {
          type: "task.create",
        },
      },
    });
  });

  it("captures previous values for task updates", () => {
    const committedEvent: ProjectEvent = {
      id: "evt_task_update",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.update",
        data: {
          status: "in_progress",
          title: "Ship phase 2 today",
        },
      },
      version: 2,
      clientId: "client_1",
      userId: "alice",
      timestamp: 1_716_000_000_300,
    };

    const historyEntry = createHistoryEntry(baseSnapshot, committedEvent);

    expect(historyEntry).toMatchObject({
      targetVersion: 2,
      undoAction: {
        entityId: "task_1",
        action: {
          type: "task.update",
          data: {
            status: "todo",
            title: "Ship phase 2",
          },
        },
      },
      redoAction: {
        entityId: "task_1",
        action: {
          type: "task.update",
          data: {
            status: "in_progress",
            title: "Ship phase 2 today",
          },
        },
      },
    });
  });

  it("creates delete/create pairs for comment creation", () => {
    const committedEvent: ProjectEvent = {
      id: "evt_comment_create",
      projectId: "project_1",
      entityId: "comment_1",
      action: {
        type: "comment.create",
        data: {
          taskId: "task_1",
          content: "Ship it",
          author: "alice",
        },
      },
      version: 2,
      clientId: "client_1",
      userId: "alice",
      timestamp: 1_716_000_000_400,
    };

    const historyEntry = createHistoryEntry(baseSnapshot, committedEvent);

    expect(historyEntry).toMatchObject({
      undoAction: {
        entityId: "comment_1",
        action: {
          type: "comment.delete",
        },
      },
      redoAction: {
        entityId: "comment_1",
        action: {
          type: "comment.create",
        },
      },
    });
  });
});
