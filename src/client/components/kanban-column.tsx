"use client";

import type { DragEvent } from "react";

import type { Task, TaskStatus } from "../../shared/types";
import { buildTaskCardViewModel } from "./workspace-task-card";
import { formatTaskStatusLabel } from "./workspace-dependencies";

type KanbanColumnProps = {
  draggingTaskId: string | null;
  onDragEnd: () => void;
  onDragStart: (taskId: string) => void;
  onDropTask: (status: TaskStatus, beforeTaskId?: string) => void;
  status: TaskStatus;
  tasks: Task[];
};

function allowDrop(event: DragEvent<HTMLDivElement>): void {
  event.preventDefault();
}

export function KanbanColumn({
  draggingTaskId,
  onDragEnd,
  onDragStart,
  onDropTask,
  status,
  tasks,
}: KanbanColumnProps) {
  return (
    <section className="kanban-column panel" data-column-status={status}>
      <div className="kanban-column-header">
        <h3>{formatTaskStatusLabel(status)}</h3>
        <span className="subtle-copy">{tasks.length} tasks</span>
      </div>

      <div className="kanban-card-stack">
        {tasks.map((task) => {
          const viewModel = buildTaskCardViewModel(task);
          return (
            <div key={task.id}>
              <div
                className="kanban-dropzone"
                data-dropzone={`before:${task.id}`}
                onDragOver={allowDrop}
                onDrop={() => onDropTask(status, task.id)}
              />
              <article
                className="kanban-card"
                data-task-id={task.id}
                draggable
                onDragEnd={onDragEnd}
                onDragStart={() => onDragStart(task.id)}
                style={{
                  opacity: draggingTaskId === task.id ? 0.55 : 1,
                }}
              >
                <h4>{task.title}</h4>
                {viewModel.description ? (
                  <p className="subtle-copy">{viewModel.description}</p>
                ) : null}
                <div className="task-meta">
                  <span className="task-meta-pill">
                    {formatTaskStatusLabel(status)}
                  </span>
                  {viewModel.priorityLabel ? (
                    <span className="task-meta-pill">
                      {viewModel.priorityLabel}
                    </span>
                  ) : null}
                </div>
              </article>
            </div>
          );
        })}

        <div
          className="kanban-dropzone"
          data-dropzone="end"
          onDragOver={allowDrop}
          onDrop={() => onDropTask(status)}
        />
      </div>
    </section>
  );
}
