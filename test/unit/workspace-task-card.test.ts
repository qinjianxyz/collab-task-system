import { describe, expect, it } from "vitest";

import type { Task } from "../../src/shared/types";
import {
  buildTaskCardViewModel,
  formatPriorityLabel,
} from "../../src/client/components/workspace-task-card";

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

describe("workspace task card helpers", () => {
  it("formats priority labels for display", () => {
    expect(formatPriorityLabel("urgent")).toBe("Urgent");
    expect(formatPriorityLabel("in_progress" as never)).toBe("In Progress");
  });

  it("builds a readable task card view model from task metadata", () => {
    const viewModel = buildTaskCardViewModel(
      createTask({
        id: "task_demo",
        title: "Ship the two-tab demo",
        status: "in_progress",
        assignedTo: ["Ray", "Jordan"],
        configuration: {
          priority: "urgent",
          description: "Verify that two browser contexts converge over SSE.",
          tags: ["demo", "sync"],
          customFields: {},
        },
      }),
    );

    expect(viewModel).toEqual({
      assigneeSummary: "Ray, Jordan",
      description: "Verify that two browser contexts converge over SSE.",
      priorityLabel: "Urgent",
      tagSummary: ["demo", "sync"],
    });
  });
});
