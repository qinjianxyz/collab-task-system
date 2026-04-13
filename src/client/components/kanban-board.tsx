"use client";

import { useMemo, useState } from "react";

import type { Task, TaskStatus } from "../../shared/types";
import { KanbanColumn } from "./kanban-column";

const BOARD_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "blocked",
  "canceled",
];

type KanbanBoardProps = {
  onMoveTask: (task: Task, status: TaskStatus, beforeTaskId?: string) => Promise<void>;
  tasks: Task[];
};

export function KanbanBoard({
  onMoveTask,
  tasks,
}: KanbanBoardProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );
  const tasksByStatus = useMemo(() => {
    const grouped = new Map<TaskStatus, Task[]>();

    for (const status of BOARD_STATUSES) {
      grouped.set(status, []);
    }

    for (const task of tasks) {
      const bucket = grouped.get(task.status) ?? [];
      bucket.push(task);
      grouped.set(task.status, bucket);
    }

    for (const [status, items] of grouped) {
      grouped.set(
        status,
        [...items].sort(
          (left, right) => left.position - right.position || left.id.localeCompare(right.id),
        ),
      );
    }

    return grouped;
  }, [tasks]);

  async function handleDrop(status: TaskStatus, beforeTaskId?: string): Promise<void> {
    if (!draggingTaskId) {
      return;
    }

    const task = tasksById.get(draggingTaskId);
    setDraggingTaskId(null);

    if (!task) {
      return;
    }

    await onMoveTask(task, status, beforeTaskId);
  }

  return (
    <div className="kanban-board">
      {BOARD_STATUSES.map((status) => (
        <KanbanColumn
          draggingTaskId={draggingTaskId}
          key={status}
          onDragEnd={() => setDraggingTaskId(null)}
          onDragStart={setDraggingTaskId}
          onDropTask={handleDrop}
          status={status}
          tasks={tasksByStatus.get(status) ?? []}
        />
      ))}
    </div>
  );
}
