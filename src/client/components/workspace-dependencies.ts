import type { Task, TaskStatus } from "../../shared/types";

export type DependencyChip = {
  id: string;
  title: string;
  status: TaskStatus;
};

type BuildDependencyCandidatesInput = {
  tasks: Task[];
  searchQuery: string;
  selectedTaskIds: string[];
  showCompleted: boolean;
};

function isCompletedStatus(status: TaskStatus): boolean {
  return status === "done" || status === "canceled";
}

function sortByPosition(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return left.title.localeCompare(right.title);
  });
}

export function formatTaskStatusLabel(status: TaskStatus): string {
  return status.replaceAll("_", " ");
}

export function buildDependencyCandidates(
  input: BuildDependencyCandidatesInput,
): Task[] {
  const normalizedQuery = input.searchQuery.trim().toLowerCase();

  return sortByPosition(input.tasks).filter((task) => {
    const selected = input.selectedTaskIds.includes(task.id);
    const visibleByStatus = input.showCompleted || !isCompletedStatus(task.status) || selected;
    const matchesSearch =
      normalizedQuery.length === 0 ||
      task.title.toLowerCase().includes(normalizedQuery);

    return visibleByStatus && matchesSearch;
  });
}

export function buildSelectedDependencyChips(
  tasks: Task[],
  selectedTaskIds: string[],
): DependencyChip[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return selectedTaskIds.flatMap((taskId) => {
    const task = tasksById.get(taskId);
    if (!task) {
      return [];
    }

    return [
      {
        id: task.id,
        title: task.title,
        status: task.status,
      },
    ];
  });
}
