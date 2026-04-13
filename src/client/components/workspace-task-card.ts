import type { Task, TaskPriority } from "../../shared/types";

type TaskCardViewModel = {
  assigneeSummary: string | null;
  description: string | null;
  priorityLabel: string | null;
  tagSummary: string[];
};

export function formatPriorityLabel(priority: TaskPriority | string): string {
  return priority
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function buildTaskCardViewModel(task: Task): TaskCardViewModel {
  return {
    assigneeSummary: task.assignedTo.length > 0 ? task.assignedTo.join(", ") : null,
    description: task.configuration.description?.trim() || null,
    priorityLabel: task.configuration.priority
      ? formatPriorityLabel(task.configuration.priority)
      : null,
    tagSummary: task.configuration.tags.filter(Boolean),
  };
}
