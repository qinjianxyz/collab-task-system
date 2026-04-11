import { describe, expect, it } from "vitest";

import type {
  AppendEventInput,
  ProjectEvent,
  ProjectSnapshot,
  ProjectTaskPage,
} from "../../src/shared/types";
import {
  applyProjectEvent,
  buildOptimisticEvent,
  deriveVisibleSnapshot,
  mergeTaskPage,
} from "../../src/client/sync/reducer";

const baseSnapshot: ProjectSnapshot = {
  project: {
    id: "project_1",
    name: "Launchpad",
    currentVersion: 1,
    createdAt: 1_716_000_000_000,
    updatedAt: 1_716_000_000_000,
    metadata: {},
  },
  tasks: [],
  comments: [],
  version: 1,
};

const loadedTaskPage: ProjectTaskPage = {
  tasks: [
    {
      id: "task_1",
      projectId: "project_1",
      title: "Loaded task",
      status: "todo",
      assignedTo: [],
      configuration: {
        tags: [],
        customFields: {},
      },
      dependencies: [],
      position: 1,
      createdAt: 1_716_000_000_010,
      updatedAt: 1_716_000_000_010,
    },
  ],
  comments: [],
  nextCursor: "cursor_1",
  hasMore: true,
  totalCount: 3,
};

const loadedSnapshot = {
  ...baseSnapshot,
  tasks: loadedTaskPage.tasks,
  comments: loadedTaskPage.comments,
  taskPage: loadedTaskPage,
};

describe("project sync reducer", () => {
  it("applies committed task and comment events in order", () => {
    const taskCreated: ProjectEvent = {
      id: "evt_task_create",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create",
        data: {
          title: "Ship realtime sync",
          status: "todo",
          projectId: "project_1",
        },
      },
      version: 2,
      clientId: "client_alpha",
      userId: "alice",
      timestamp: 1_716_000_000_100,
    };

    const commentCreated: ProjectEvent = {
      id: "evt_comment_create",
      projectId: "project_1",
      entityId: "comment_1",
      action: {
        type: "comment.create",
        data: {
          taskId: "task_1",
          content: "hey @bob",
          author: "alice",
        },
      },
      version: 3,
      clientId: "client_alpha",
      userId: "alice",
      timestamp: 1_716_000_000_200,
    };

    const withTask = applyProjectEvent(baseSnapshot, taskCreated);
    const withComment = applyProjectEvent(withTask, commentCreated);

    expect(withComment.version).toBe(3);
    expect(withComment.tasks[0]).toMatchObject({
      id: "task_1",
      title: "Ship realtime sync",
    });
    expect(withComment.comments[0]).toMatchObject({
      id: "comment_1",
      mentions: ["bob"],
    });
  });

  it("ignores stale committed events that are already reflected in the snapshot", () => {
    const taskCreated: ProjectEvent = {
      id: "evt_task_create",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create",
        data: {
          title: "Ship realtime sync",
          status: "todo",
          projectId: "project_1",
        },
      },
      version: 2,
      clientId: "client_alpha",
      userId: "alice",
      timestamp: 1_716_000_000_100,
    };

    const snapshot = applyProjectEvent(baseSnapshot, taskCreated);
    const duplicate = applyProjectEvent(snapshot, taskCreated);

    expect(duplicate).toEqual(snapshot);
  });

  it("derives an optimistic snapshot without mutating the committed base snapshot", () => {
    const optimisticInput: AppendEventInput = {
      id: "evt_task_create",
      projectId: "project_1",
      entityId: "task_1",
      action: {
        type: "task.create",
        data: {
          title: "Optimistic task",
          status: "todo",
          projectId: "project_1",
        },
      },
      clientId: "client_alpha",
      userId: "alice",
      timestamp: 1_716_000_000_100,
      expectedVersion: 1,
    };

    const optimisticEvent = buildOptimisticEvent(baseSnapshot, optimisticInput);
    const visibleSnapshot = deriveVisibleSnapshot(baseSnapshot, optimisticEvent);

    expect(baseSnapshot.tasks).toHaveLength(0);
    expect(visibleSnapshot.tasks[0]).toMatchObject({
      id: "task_1",
      title: "Optimistic task",
    });
    expect(visibleSnapshot.version).toBe(2);
  });

  it("merges the next loaded task page into the visible snapshot", () => {
    const merged = mergeTaskPage(loadedSnapshot, {
      tasks: [
        {
          id: "task_2",
          projectId: "project_1",
          title: "Second page task",
          status: "todo",
          assignedTo: [],
          configuration: {
            tags: [],
            customFields: {},
          },
          dependencies: [],
          position: 2,
          createdAt: 1_716_000_000_020,
          updatedAt: 1_716_000_000_020,
        },
      ],
      comments: [
        {
          id: "comment_2",
          taskId: "task_2",
          content: "hello",
          author: "alice",
          mentions: [],
          createdAt: 1_716_000_000_030,
          updatedAt: 1_716_000_000_030,
        },
      ],
      nextCursor: null,
      hasMore: false,
      totalCount: 3,
    });

    expect(merged.tasks.map((task) => task.id)).toEqual(["task_1", "task_2"]);
    expect(merged.comments.map((comment) => comment.id)).toEqual(["comment_2"]);
    expect(merged.taskPage.hasMore).toBe(false);
    expect(merged.taskPage.nextCursor).toBeNull();
  });

  it("advances version but ignores updates for unloaded tasks", () => {
    const updated = applyProjectEvent(loadedSnapshot, {
      id: "evt_task_update_unloaded",
      projectId: "project_1",
      entityId: "task_3",
      action: {
        type: "task.update",
        data: {
          status: "done",
        },
      },
      version: 2,
      clientId: "client_alpha",
      userId: "alice",
      timestamp: 1_716_000_000_200,
    });

    expect(updated.version).toBe(2);
    expect(updated.tasks.map((task) => task.id)).toEqual(["task_1"]);
    expect(updated.taskPage.totalCount).toBe(3);
  });
});
