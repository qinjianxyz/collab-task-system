import { beforeEach, describe, expect, it, vi } from "vitest";

const withTransactionMock = vi.fn();

vi.mock("../../src/server/db/client", () => ({
  withTransaction: withTransactionMock,
}));

describe("getSnapshot", () => {
  beforeEach(() => {
    vi.resetModules();
    withTransactionMock.mockReset();
  });

  it("reads project, tasks, and comments within one transaction", async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "project_1",
            name: "Project 1",
            description: "Ship phase 2",
            metadata: {},
            current_version: 5,
            created_at: new Date("2026-04-10T10:00:00.000Z"),
            updated_at: new Date("2026-04-10T10:05:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "task_1",
            project_id: "project_1",
            title: "Task 1",
            status: "todo",
            assigned_to: [],
            configuration: {
              tags: [],
              customFields: {},
            },
            dependencies: [],
            position: 1,
            created_at: new Date("2026-04-10T10:01:00.000Z"),
            updated_at: new Date("2026-04-10T10:01:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "comment_1",
            task_id: "task_1",
            content: "hello @alice",
            author: "alice",
            mentions: ["alice"],
            created_at: new Date("2026-04-10T10:02:00.000Z"),
            updated_at: new Date("2026-04-10T10:02:00.000Z"),
          },
        ],
      });

    withTransactionMock.mockImplementation(async (callback) =>
      callback({
        query: queryMock,
      }),
    );

    const { getSnapshot } = await import("../../src/server/events/snapshot");
    const snapshot = await getSnapshot("project_1");

    expect(withTransactionMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(snapshot.version).toBe(5);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.comments).toHaveLength(1);
  });
});
