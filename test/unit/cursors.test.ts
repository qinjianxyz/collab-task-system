import { describe, expect, it } from "vitest";

import {
  buildTaskCursorBadges,
  createPresenceCursor,
  describePresenceCursor,
} from "../../src/client/cursors";
import type { PresenceViewer } from "../../src/shared/types";

function createViewer(
  overrides: Partial<PresenceViewer> = {},
): PresenceViewer {
  return {
    clientId: "client_alice",
    userId: "alice",
    location: "project",
    connectedAt: 1_716_000_000_000,
    ...overrides,
  };
}

describe("presence cursor helpers", () => {
  it("shapes semantic task cursors for comment composers", () => {
    expect(
      createPresenceCursor({
        kind: "comment",
        taskId: "task_ship_demo",
        taskTitle: "Ship demo",
      }),
    ).toEqual({
      kind: "comment",
      taskId: "task_ship_demo",
      taskTitle: "Ship demo",
      label: "Commenting on Ship demo",
    });
  });

  it("formats human-readable labels for cursor badges", () => {
    expect(
      describePresenceCursor(
        createPresenceCursor({
          kind: "description",
          taskId: "task_docs",
          taskTitle: "Docs polish",
        }),
      ),
    ).toBe("Editing description");
  });

  it("builds per-task cursor badges from the active viewer list", () => {
    const viewers = [
      createViewer({
        userId: "bob",
        cursor: createPresenceCursor({
          kind: "comment",
          taskId: "task_ship_demo",
          taskTitle: "Ship demo",
        }),
      }),
      createViewer({
        clientId: "client_carol",
        userId: "carol",
        cursor: createPresenceCursor({
          kind: "description",
          taskId: "task_docs",
          taskTitle: "Docs polish",
        }),
      }),
      createViewer({
        clientId: "client_dan",
        userId: "dan",
      }),
    ];

    expect(buildTaskCursorBadges(viewers, "task_ship_demo")).toEqual([
      {
        clientId: "client_alice",
        userId: "bob",
        label: "Commenting on Ship demo",
        shortLabel: "commenting",
      },
    ]);

    expect(buildTaskCursorBadges(viewers, "task_docs")).toEqual([
      {
        clientId: "client_carol",
        userId: "carol",
        label: "Editing description",
        shortLabel: "editing",
      },
    ]);
  });
});
