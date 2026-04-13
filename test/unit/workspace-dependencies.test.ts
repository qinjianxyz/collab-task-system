import { describe, expect, it } from "vitest";

import type { Task } from "../../src/shared/types";
import {
  buildDependencyCandidates,
  buildSelectedDependencyChips,
  formatTaskStatusLabel,
} from "../../src/client/components/workspace-dependencies";

function createTask(
  overrides: Partial<Task> & Pick<Task, "id" | "title" | "status">,
): Task {
  return {
    projectId: "project_demo",
    assignedTo: [],
    configuration: {
      tags: [],
      customFields: {},
    },
    dependencies: [],
    position: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("workspace dependency helpers", () => {
  const tasks = [
    createTask({
      id: "task_api",
      title: "Finalize event store API",
      status: "done",
      position: 1,
    }),
    createTask({
      id: "task_sync",
      title: "Wire optimistic sync hook",
      status: "in_progress",
      position: 2,
    }),
    createTask({
      id: "task_demo",
      title: "Ship the two-tab demo",
      status: "todo",
      position: 3,
    }),
  ];

  it("hides completed prerequisites by default and filters by search", () => {
    const candidates = buildDependencyCandidates({
      tasks,
      searchQuery: "sync",
      selectedTaskIds: [],
      showCompleted: false,
    });

    expect(candidates.map((task) => task.id)).toEqual(["task_sync"]);
  });

  it("keeps selected prerequisites visible as chips even when already done", () => {
    const chips = buildSelectedDependencyChips(tasks, ["task_api", "task_demo"]);

    expect(chips).toEqual([
      {
        id: "task_api",
        title: "Finalize event store API",
        status: "done",
      },
      {
        id: "task_demo",
        title: "Ship the two-tab demo",
        status: "todo",
      },
    ]);
  });

  it("formats task status labels for human-readable UI copy", () => {
    expect(formatTaskStatusLabel("in_progress")).toBe("In Progress");
    expect(formatTaskStatusLabel("todo")).toBe("Todo");
  });
});
