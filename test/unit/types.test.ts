import { describe, expect, it } from "vitest";

import {
  pagedProjectSnapshotResponseSchema,
  projectTaskPageResponseSchema,
} from "../../src/shared/api";
import {
  appendEventInputSchema,
  taskCursorSchema,
} from "../../src/shared/types";

describe("appendEventInputSchema", () => {
  it("rejects an append command without expectedVersion", () => {
    const result = appendEventInputSchema.safeParse({
      id: "evt_1",
      projectId: "project_1",
      entityId: "project_1",
      action: {
        type: "project.create",
        data: {
          name: "Project 1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: Date.now(),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid append command", () => {
    const result = appendEventInputSchema.safeParse({
      id: "evt_1",
      projectId: "project_1",
      entityId: "project_1",
      action: {
        type: "project.create",
        data: {
          name: "Project 1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: Date.now(),
      expectedVersion: 0,
    });

    expect(result.success).toBe(true);
  });
});

describe("task pagination schemas", () => {
  it("accepts an opaque task cursor string", () => {
    const result = taskCursorSchema.safeParse("cG9zaXRpb246MS4wOmlkOnRhc2tfMQ==");

    expect(result.success).toBe(true);
  });

  it("accepts a paged project snapshot response", () => {
    const result = pagedProjectSnapshotResponseSchema.safeParse({
      snapshot: {
        project: {
          id: "project_1",
          name: "Project 1",
          currentVersion: 2,
          createdAt: 1_716_000_000_000,
          updatedAt: 1_716_000_000_000,
          metadata: {},
        },
        version: 2,
        taskPage: {
          tasks: [
            {
              id: "task_1",
              projectId: "project_1",
              title: "Task 1",
              status: "todo",
              assignedTo: [],
              configuration: {
                tags: [],
                customFields: {},
              },
              dependencies: [],
              position: 1,
              createdAt: 1_716_000_000_000,
              updatedAt: 1_716_000_000_000,
            },
          ],
          comments: [],
          nextCursor: "cursor_2",
          hasMore: true,
          totalCount: 10,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a standalone project task page response", () => {
    const result = projectTaskPageResponseSchema.safeParse({
      page: {
        tasks: [],
        comments: [],
        nextCursor: null,
        hasMore: false,
        totalCount: 0,
      },
    });

    expect(result.success).toBe(true);
  });
});
