"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import type { Comment, Task, TaskStatus } from "../../shared/types";
import { getOrCreateClientId, getStoredDisplayName, setStoredDisplayName } from "../identity";
import { useProjectSync } from "../hooks/useProjectSync";
import { VirtualTaskList } from "./virtual-task-list";

const STATUS_OPTIONS: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "blocked",
  "canceled",
];

function nextStatus(status: TaskStatus): TaskStatus {
  const currentIndex = STATUS_OPTIONS.indexOf(status);
  return STATUS_OPTIONS[(currentIndex + 1) % STATUS_OPTIONS.length] ?? "todo";
}

function groupCommentsByTask(
  comments: Comment[],
): Map<string, Comment[]> {
  const groupedComments = new Map<string, Comment[]>();

  for (const comment of comments) {
    const taskComments = groupedComments.get(comment.taskId) ?? [];
    taskComments.push(comment);
    groupedComments.set(comment.taskId, taskComments);
  }

  return groupedComments;
}

type ProjectWorkspaceProps = {
  projectId: string;
};

export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  const [clientId, setClientId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("todo");
  const [taskDependencies, setTaskDependencies] = useState<string[]>([]);
  const [dependencyQuery, setDependencyQuery] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [showShortcuts, setShowShortcuts] = useState(false);
  const taskInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setClientId(getOrCreateClientId());
    setDisplayName(getStoredDisplayName());
  }, []);

  const normalizedDisplayName = displayName.trim();
  const sync = useProjectSync(projectId, {
    clientId,
    userId: normalizedDisplayName || "anonymous",
  });

  const snapshot = sync.snapshot;
  const commentsByTask = snapshot ? groupCommentsByTask(snapshot.comments) : new Map();
  const canMutate = Boolean(snapshot && clientId && normalizedDisplayName) && !sync.isMutating;
  const tasksById = new Map((snapshot?.tasks ?? []).map((task) => [task.id, task]));
  const normalizedDependencyQuery = dependencyQuery.trim().toLowerCase();
  const dependencyOptions = (() => {
    if (!snapshot) {
      return [];
    }

    const selectedTasks = taskDependencies
      .map((dependencyId) => tasksById.get(dependencyId))
      .filter((task): task is Task => Boolean(task));
    const matchedTasks = snapshot.tasks.filter((task) => {
      if (taskDependencies.includes(task.id)) {
        return false;
      }

      if (!normalizedDependencyQuery) {
        return true;
      }

      return task.title.toLowerCase().includes(normalizedDependencyQuery);
    });

    return [...new Map([...selectedTasks, ...matchedTasks].map((task) => [task.id, task])).values()].slice(0, 24);
  })();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isEditable =
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT";

      if (event.key === "Escape") {
        setShowShortcuts(false);
        return;
      }

      if (!isEditable && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === "?") {
          event.preventDefault();
          setShowShortcuts(true);
          return;
        }

        if (event.key.toLowerCase() === "n") {
          event.preventDefault();
          taskInputRef.current?.focus();
        }
      }

      if (isEditable || event.altKey || !(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (event.key.toLowerCase() !== "z") {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        void sync.redo();
        return;
      }

      void sync.undo();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sync.redo, sync.undo]);

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const normalizedTitle = taskTitle.trim();
    if (!normalizedTitle) {
      return;
    }

    try {
      await sync.dispatch({
        entityId: crypto.randomUUID(),
        action: {
          type: "task.create",
          data: {
            title: normalizedTitle,
            status: taskStatus,
            projectId,
            dependencies: taskDependencies,
          },
        },
      });
      setTaskTitle("");
      setTaskStatus("todo");
      setTaskDependencies([]);
      setDependencyQuery("");
    } catch {
      // error is surfaced by the hook state
    }
  }

  async function handleStatusAdvance(task: Task): Promise<void> {
    try {
      await sync.dispatch({
        entityId: task.id,
        action: {
          type: "task.update",
          data: {
            status: nextStatus(task.status),
          },
        },
      });
    } catch {
      // error is surfaced by the hook state
    }
  }

  async function handleCommentSubmit(taskId: string): Promise<void> {
    const content = commentDrafts[taskId]?.trim();
    if (!content || !normalizedDisplayName) {
      return;
    }

    try {
      await sync.dispatch({
        entityId: crypto.randomUUID(),
        action: {
          type: "comment.create",
          data: {
            taskId,
            content,
            author: normalizedDisplayName,
          },
        },
      });

      setCommentDrafts((current) => ({
        ...current,
        [taskId]: "",
      }));
    } catch {
      // error is surfaced by the hook state
    }
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div className="header-stack">
          <p className="eyebrow">Project</p>
          <h1>{snapshot?.project.name ?? "Loading project..."}</h1>
          <p className="subtle-copy">
            {snapshot
              ? `${sync.totalTaskCount} tasks · ${snapshot.tasks.length} loaded · version ${snapshot.version}`
              : "Fetching snapshot and stream..."}
          </p>

          <div className="presence-summary">
            <span className="subtle-copy">Viewing now</span>
            <div className="viewer-list">
              {sync.viewers.length > 0 ? (
                sync.viewers.map((viewer) => (
                  <span className="viewer-chip" key={viewer.clientId}>
                    {viewer.userId}
                  </span>
                ))
              ) : (
                <span className="subtle-copy">Waiting for viewers...</span>
              )}
            </div>
          </div>
        </div>

        <div className="header-controls">
          <label className="field compact-field">
            <span>Display name</span>
            <input
              className="text-input"
              onBlur={() => setStoredDisplayName(normalizedDisplayName)}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="alice"
              value={displayName}
            />
          </label>

          <div className={`status-pill status-${sync.connectionStatus}`}>
            {sync.connectionStatus}
          </div>

          <div className="history-controls">
            <button
              className="secondary-button"
              disabled={!sync.canUndo}
              onClick={() => {
                void sync.undo();
              }}
              type="button"
            >
              Undo
            </button>

            <button
              className="secondary-button"
              disabled={!sync.canRedo}
              onClick={() => {
                void sync.redo();
              }}
              type="button"
            >
              Redo
            </button>
          </div>
        </div>
      </header>

      {sync.error ? <p className="error-banner">{sync.error}</p> : null}

      <div className="workspace-body">
        <div className="workspace-main">
          <section className="panel">
            <form className="task-form" onSubmit={handleTaskSubmit}>
              <label className="field grow-field">
                <span>Add task</span>
                <input
                  aria-label="Add task"
                  className="text-input"
                  disabled={!snapshot}
                  ref={taskInputRef}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="Ship the two-tab demo"
                  value={taskTitle}
                />
              </label>

              <label className="field">
                <span>Status</span>
                <select
                  className="text-input"
                  onChange={(event) => setTaskStatus(event.target.value as TaskStatus)}
                  value={taskStatus}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <button className="primary-button" disabled={!canMutate} type="submit">
                {sync.isMutating ? "Syncing..." : "Add task"}
              </button>
            </form>

            {snapshot?.tasks.length ? (
              <div className="dependency-selector">
                <span className="field-label">Dependencies</span>
                <input
                  className="text-input"
                  onChange={(event) => setDependencyQuery(event.target.value)}
                  placeholder="Filter loaded tasks"
                  value={dependencyQuery}
                />
                {snapshot.tasks.length > dependencyOptions.length ? (
                  <p className="subtle-copy">
                    Showing {dependencyOptions.length} of {snapshot.tasks.length} loaded tasks.
                  </p>
                ) : null}
                <div className="dependency-options">
                  {dependencyOptions.map((task) => (
                    <label className="dependency-option" key={task.id}>
                      <input
                        aria-label={`Depends on ${task.title}`}
                        checked={taskDependencies.includes(task.id)}
                        onChange={(event) =>
                          setTaskDependencies((current) =>
                            event.target.checked
                              ? [...current, task.id]
                              : current.filter((dependencyId) => dependencyId !== task.id),
                          )
                        }
                        type="checkbox"
                      />
                      <span>{task.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="task-grid">
            {!snapshot ? (
              <div className="panel">
                <p className="subtle-copy">Waiting for the initial snapshot.</p>
              </div>
            ) : (
              <VirtualTaskList
                className="task-list-shell"
                emptyState={(
                  <div className="panel">
                    <p className="subtle-copy">
                      No tasks yet. Add one above, then open the same page in another tab to
                      watch it appear over the event stream.
                    </p>
                  </div>
                )}
                getKey={(task) => task.id}
                hasMore={sync.hasMoreTasks}
                isLoadingMore={sync.isLoadingMoreTasks}
                items={snapshot.tasks}
                onLoadMore={sync.loadMoreTasks}
                renderItem={(task) => (
                  <article className="task-card">
                    <div className="task-card-header">
                      <div>
                        <h2>{task.title}</h2>
                        <p className="subtle-copy">Task {task.id.slice(0, 8)}</p>
                        {task.dependencies.length > 0 ? (
                          <p className="dependency-copy">
                            Depends on:{" "}
                            {task.dependencies
                              .map((dependencyId) => tasksById.get(dependencyId)?.title ?? dependencyId)
                              .join(", ")}
                          </p>
                        ) : null}
                      </div>

                      <button
                        className="status-button"
                        disabled={!canMutate}
                        onClick={() => {
                          void handleStatusAdvance(task);
                        }}
                        type="button"
                      >
                        {task.status}
                      </button>
                    </div>

                    <div className="comment-list">
                      {(commentsByTask.get(task.id) ?? []).map((comment: Comment) => (
                        <div className="comment-item" key={comment.id}>
                          <strong>{comment.author}</strong>
                          <p>{comment.content}</p>
                        </div>
                      ))}
                    </div>

                    <div className="comment-composer">
                      <input
                        className="text-input"
                        disabled={!canMutate}
                        onChange={(event) =>
                          setCommentDrafts((current) => ({
                            ...current,
                            [task.id]: event.target.value,
                          }))
                        }
                        placeholder="Add a comment with @mentions"
                        value={commentDrafts[task.id] ?? ""}
                      />

                      <button
                        className="secondary-button"
                        disabled={!canMutate}
                        onClick={() => {
                          void handleCommentSubmit(task.id);
                        }}
                        type="button"
                      >
                        Comment
                      </button>
                    </div>
                  </article>
                )}
              />
            )}
          </section>
        </div>

        <aside className="panel activity-panel">
          <div className="activity-header">
            <p className="eyebrow">Live Feed</p>
            <h2>Activity</h2>
            <p className="subtle-copy">
              This sidebar is another projection over the same project stream.
            </p>
          </div>

          <div className="activity-list">
            {sync.activity.length > 0 ? (
              sync.activity.map((item) => (
                <div className="activity-item" key={item.id}>
                  <strong>{item.actor}</strong>
                  <p>{item.summary}</p>
                </div>
              ))
            ) : (
              <p className="subtle-copy">No events yet. Create a task to start the feed.</p>
            )}
          </div>
        </aside>
      </div>

      {showShortcuts ? (
        <div
          aria-label="Keyboard shortcuts"
          className="shortcut-overlay"
          onClick={() => setShowShortcuts(false)}
          role="presentation"
        >
          <section
            className="shortcut-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <p className="eyebrow">Keyboard shortcuts</p>
            <h2>Keyboard shortcuts</h2>
            <div className="shortcut-list">
              <p>
                <strong>Ctrl+Z / Cmd+Z</strong>
                <span>Undo the latest local event</span>
              </p>
              <p>
                <strong>Ctrl+Shift+Z / Cmd+Shift+Z</strong>
                <span>Redo the last undone event</span>
              </p>
              <p>
                <strong>N</strong>
                <span>Focus the new-task input</span>
              </p>
              <p>
                <strong>Escape</strong>
                <span>Close this overlay</span>
              </p>
            </div>

            <button
              className="secondary-button"
              onClick={() => setShowShortcuts(false)}
              type="button"
            >
              Close
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
