"use client";

import type { RefObject } from "react";

import type { Task, TaskStatus } from "../../shared/types";
import { formatTaskStatusLabel } from "./workspace-dependencies";

type DependencyChip = Pick<Task, "id" | "title" | "status">;

type WorkspaceTaskComposerProps = {
  canMutate: boolean;
  dependencyCandidates: Task[];
  dependencySearchQuery: string;
  onDependencyRemove: (taskId: string) => void;
  onDependencySearchChange: (value: string) => void;
  onDependencyToggle: (taskId: string, checked: boolean) => void;
  onShowCompletedDependenciesChange: (value: boolean) => void;
  onSubmit: () => void;
  onTaskStatusChange: (status: TaskStatus) => void;
  onTaskTitleChange: (value: string) => void;
  selectedDependencyChips: DependencyChip[];
  showCompletedDependencies: boolean;
  statusOptions: TaskStatus[];
  taskDependencies: string[];
  taskInputRef: RefObject<HTMLInputElement | null>;
  taskStatus: TaskStatus;
  taskTitle: string;
};

export function WorkspaceTaskComposer({
  canMutate,
  dependencyCandidates,
  dependencySearchQuery,
  onDependencyRemove,
  onDependencySearchChange,
  onDependencyToggle,
  onShowCompletedDependenciesChange,
  onSubmit,
  onTaskStatusChange,
  onTaskTitleChange,
  selectedDependencyChips,
  showCompletedDependencies,
  statusOptions,
  taskDependencies,
  taskInputRef,
  taskStatus,
  taskTitle,
}: WorkspaceTaskComposerProps) {
  return (
    <section className="panel">
      <form
        className="task-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="field grow-field">
          <span>Add task</span>
          <input
            aria-label="Add task"
            className="text-input"
            disabled={!canMutate}
            onChange={(event) => onTaskTitleChange(event.target.value)}
            placeholder="Ship the two-tab demo"
            ref={taskInputRef}
            value={taskTitle}
          />
        </label>

        <label className="field">
          <span>Status</span>
          <select
            className="text-input"
            onChange={(event) => onTaskStatusChange(event.target.value as TaskStatus)}
            value={taskStatus}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <button className="primary-button" disabled={!canMutate} type="submit">
          Add task
        </button>
      </form>

      {dependencyCandidates.length > 0 || selectedDependencyChips.length > 0 ? (
        <div className="dependency-selector">
          <div className="dependency-header">
            <div className="dependency-heading">
              <span className="field-label">Blocked by</span>
              <p className="dependency-helper">
                This new task stays blocked until these prerequisite tasks are done.
              </p>
            </div>

            <label className="dependency-toggle">
              <input
                checked={showCompletedDependencies}
                onChange={(event) =>
                  onShowCompletedDependenciesChange(event.target.checked)}
                type="checkbox"
              />
              <span>Show completed tasks</span>
            </label>
          </div>

          <div className="dependency-selected">
            {selectedDependencyChips.length > 0 ? (
              selectedDependencyChips.map((task) => (
                <button
                  className="dependency-chip"
                  key={task.id}
                  onClick={() => onDependencyRemove(task.id)}
                  type="button"
                >
                  <span>{task.title}</span>
                  <strong>{formatTaskStatusLabel(task.status)}</strong>
                </button>
              ))
            ) : (
              <p className="subtle-copy">No prerequisites selected.</p>
            )}
          </div>

          <label className="field">
            <span>Search prerequisite tasks</span>
            <input
              className="text-input"
              onChange={(event) => onDependencySearchChange(event.target.value)}
              placeholder="Filter tasks by title"
              value={dependencySearchQuery}
            />
          </label>

          <p className="subtle-copy">
            {dependencyCandidates.length} prerequisite candidate
            {dependencyCandidates.length === 1 ? "" : "s"}.
          </p>

          <div className="dependency-options">
            {dependencyCandidates.length > 0 ? (
              dependencyCandidates.map((task) => {
                const isSelected = taskDependencies.includes(task.id);

                return (
                  <label
                    className={`dependency-option${isSelected ? " dependency-option-selected" : ""}`}
                    key={task.id}
                  >
                    <input
                      aria-label={`Blocked by ${task.title}`}
                      checked={isSelected}
                      onChange={(event) => onDependencyToggle(task.id, event.target.checked)}
                      type="checkbox"
                    />

                    <div className="dependency-option-copy">
                      <span className="dependency-option-title">{task.title}</span>
                      <span className={`task-status-badge task-status-${task.status}`}>
                        {formatTaskStatusLabel(task.status)}
                      </span>
                    </div>
                  </label>
                );
              })
            ) : (
              <p className="subtle-copy">No matching prerequisite tasks.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
