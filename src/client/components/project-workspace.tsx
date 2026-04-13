"use client";

import { useEffect, useRef, useState } from "react";

import type { ProjectTaskPageResponse } from "../../shared/api";
import type { Comment, ProjectSnapshot, Task, TaskStatus } from "../../shared/types";
import { createPresenceCursor } from "../cursors";
import { useProjectSync } from "../hooks/useProjectSync";
import { getOrCreateClientId, getStoredDisplayName, setStoredDisplayName } from "../identity";
import { getReorderedPosition } from "../kanban/position";
import { WorkspaceActivityFeed } from "./workspace-activity-feed";
import { WorkspaceAlert } from "./workspace-alert";
import { WorkspaceHeader } from "./workspace-header";
import { KanbanBoard } from "./kanban-board";
import { buildSelectedDependencyChips, buildDependencyCandidates } from "./workspace-dependencies";
import { WorkspaceNotifications } from "./workspace-notifications";
import { buildWorkspaceStatusViewModel } from "./workspace-status";
import { WorkspaceShortcuts } from "./workspace-shortcuts";
import { WorkspaceTaskComposer } from "./workspace-task-composer";
import { WorkspaceTaskList } from "./workspace-task-list";

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
  initialSnapshot?: ProjectSnapshot;
  initialTaskPage?: ProjectTaskPageResponse["page"];
  projectId: string;
};

export function ProjectWorkspace({
  initialSnapshot,
  initialTaskPage,
  projectId,
}: ProjectWorkspaceProps) {
  const [clientId, setClientId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("todo");
  const [taskDependencies, setTaskDependencies] = useState<string[]>([]);
  const [dependencySearchQuery, setDependencySearchQuery] = useState("");
  const [showCompletedDependencies, setShowCompletedDependencies] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentEdits, setCommentEdits] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const taskInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setClientId(getOrCreateClientId());
    setDisplayName(getStoredDisplayName());
  }, []);

  const normalizedDisplayName = displayName.trim();
  const sync = useProjectSync(
    projectId,
    {
      clientId,
      userId: normalizedDisplayName || "anonymous",
    },
    initialSnapshot,
    initialTaskPage,
  );

  const snapshot = sync.snapshot;
  const commentsByTask = snapshot ? groupCommentsByTask(snapshot.comments) : new Map();
  const canMutate = Boolean(snapshot && clientId && normalizedDisplayName) && !sync.isMutating;
  const tasksById = new Map((snapshot?.tasks ?? []).map((task) => [task.id, task]));
  const dependencyCandidates = buildDependencyCandidates({
    tasks: snapshot?.tasks ?? [],
    searchQuery: dependencySearchQuery,
    selectedTaskIds: taskDependencies,
    showCompleted: showCompletedDependencies,
  });
  const selectedDependencyChips = buildSelectedDependencyChips(
    snapshot?.tasks ?? [],
    taskDependencies,
  );
  const taskInventoryCopy = snapshot
    ? sync.totalTaskCount > snapshot.tasks.length
      ? `Showing ${snapshot.tasks.length} of ${sync.totalTaskCount} tasks · version ${snapshot.version}`
      : `${snapshot.tasks.length} tasks · version ${snapshot.version}`
    : "Fetching snapshot and stream...";
  const shouldVirtualizeTaskList = Boolean(
    snapshot && (sync.hasMoreTasks || sync.totalTaskCount > 40),
  );
  const statusViewModel = buildWorkspaceStatusViewModel({
    connectionStatus: sync.connectionStatus,
    error: sync.error,
    isMutating: sync.isMutating,
  });

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

  function clearCommentEdit(commentId: string): void {
    setEditingCommentId((current) => (current === commentId ? null : current));
    setCommentEdits((current) => {
      const next = { ...current };
      delete next[commentId];
      return next;
    });
  }

  function startCommentEdit(comment: Comment): void {
    setEditingCommentId(comment.id);
    setCommentEdits((current) => ({
      ...current,
      [comment.id]: comment.content,
    }));
  }

  async function handleTaskSubmit(): Promise<void> {
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
      setDependencySearchQuery("");
      setShowCompletedDependencies(false);
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

  async function handleTaskDelete(task: Task): Promise<void> {
    try {
      await sync.dispatch({
        entityId: task.id,
        action: {
          type: "task.delete",
          data: {},
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

  async function handleCommentUpdate(comment: Comment): Promise<void> {
    const content = commentEdits[comment.id]?.trim();
    if (!content) {
      return;
    }

    try {
      await sync.dispatch({
        entityId: comment.id,
        action: {
          type: "comment.update",
          data: {
            content,
          },
        },
      });

      clearCommentEdit(comment.id);
    } catch {
      // error is surfaced by the hook state
    }
  }

  async function handleCommentDelete(comment: Comment): Promise<void> {
    try {
      await sync.dispatch({
        entityId: comment.id,
        action: {
          type: "comment.delete",
          data: {},
        },
      });

      clearCommentEdit(comment.id);
    } catch {
      // error is surfaced by the hook state
    }
  }

  async function handleTaskDescriptionPersist(task: Task, value: string): Promise<void> {
    const normalizedValue = value.trim();
    const currentDescription = task.configuration.description?.trim() ?? "";

    if (normalizedValue === currentDescription) {
      return;
    }

    try {
      await sync.dispatch({
        entityId: task.id,
        action: {
          type: "task.update",
          data: {
            configuration: {
              ...task.configuration,
              description: normalizedValue,
            },
          },
        },
      });
    } catch {
      // error is surfaced by the hook state
    }
  }

  async function handleKanbanMove(
    task: Task,
    targetStatus: TaskStatus,
    beforeTaskId?: string,
  ): Promise<void> {
    const siblingTasks = (snapshot?.tasks ?? [])
      .filter((candidate) => candidate.status === targetStatus && candidate.id !== task.id)
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));

    const insertionIndex = beforeTaskId
      ? siblingTasks.findIndex((candidate) => candidate.id === beforeTaskId)
      : siblingTasks.length;
    const normalizedIndex = insertionIndex >= 0 ? insertionIndex : siblingTasks.length;
    const previousPosition =
      normalizedIndex > 0 ? siblingTasks[normalizedIndex - 1]?.position : undefined;
    const nextPosition =
      beforeTaskId && normalizedIndex < siblingTasks.length
        ? siblingTasks[normalizedIndex]?.position
        : undefined;

    try {
      await sync.dispatch({
        entityId: task.id,
        action: {
          type: "task.update",
          data: {
            status: targetStatus,
            position: getReorderedPosition(previousPosition, nextPosition),
          },
        },
      });
    } catch {
      // error is surfaced by the hook state
    }
  }

  return (
    <main className="workspace-shell">
      <WorkspaceHeader
        canRedo={sync.canRedo}
        canUndo={sync.canUndo}
        displayName={displayName}
        onDisplayNameBlur={() => setStoredDisplayName(normalizedDisplayName)}
        onDisplayNameChange={setDisplayName}
        onRedo={() => {
          void sync.redo();
        }}
        onRefresh={() => {
          void sync.refresh();
        }}
        onUndo={() => {
          void sync.undo();
        }}
        project={snapshot?.project ?? null}
        status={statusViewModel}
        taskInventoryCopy={taskInventoryCopy}
        viewers={sync.viewers}
      />

      <WorkspaceAlert
        message={sync.error}
        onRetry={sync.connectionStatus !== "connected"
          ? () => {
              void sync.refresh();
            }
          : undefined}
      />

      <div className="workspace-body">
        <div className="workspace-main">
          <WorkspaceTaskComposer
            canMutate={canMutate}
            dependencyCandidates={dependencyCandidates}
            dependencySearchQuery={dependencySearchQuery}
            onDependencyRemove={(taskId) =>
              setTaskDependencies((current) =>
                current.filter((dependencyId) => dependencyId !== taskId),
              )}
            onDependencySearchChange={setDependencySearchQuery}
            onDependencyToggle={(taskId, checked) =>
              setTaskDependencies((current) =>
                checked
                  ? [...current, taskId]
                  : current.filter((dependencyId) => dependencyId !== taskId),
              )}
            onShowCompletedDependenciesChange={setShowCompletedDependencies}
            onSubmit={() => {
              void handleTaskSubmit();
            }}
            onTaskStatusChange={setTaskStatus}
            onTaskTitleChange={setTaskTitle}
            selectedDependencyChips={selectedDependencyChips}
            showCompletedDependencies={showCompletedDependencies}
            statusOptions={STATUS_OPTIONS}
            taskDependencies={taskDependencies}
            taskInputRef={taskInputRef}
            taskStatus={taskStatus}
            taskTitle={taskTitle}
          />

          <section className="task-grid">
            {!snapshot ? (
              <div className="panel">
                <p className="subtle-copy">Waiting for the initial snapshot.</p>
              </div>
            ) : (
              <>
                <div className="view-toggle">
                  <button
                    className={`secondary-button${viewMode === "list" ? " view-toggle-active" : ""}`}
                    onClick={() => setViewMode("list")}
                    type="button"
                  >
                    List view
                  </button>
                  <button
                    className={`secondary-button${viewMode === "board" ? " view-toggle-active" : ""}`}
                    onClick={() => setViewMode("board")}
                    type="button"
                  >
                    Board view
                  </button>
                </div>

                {viewMode === "board" ? (
                  <KanbanBoard
                    onMoveTask={(task, status, beforeTaskId) =>
                      handleKanbanMove(task, status, beforeTaskId)}
                    tasks={snapshot.tasks}
                  />
                ) : (
                  <WorkspaceTaskList
                    canMutate={canMutate}
                    clientId={clientId}
                    commentDrafts={commentDrafts}
                    commentEdits={commentEdits}
                    commentsByTask={commentsByTask}
                    editingCommentId={editingCommentId}
                    hasMoreTasks={sync.hasMoreTasks}
                    isLoadingMoreTasks={sync.isLoadingMoreTasks}
                    normalizedDisplayName={normalizedDisplayName}
                    onCommentDelete={(comment) => {
                      void handleCommentDelete(comment);
                    }}
                    onCommentDraftChange={(taskId, value) =>
                      setCommentDrafts((current) => ({
                        ...current,
                        [taskId]: value,
                      }))}
                    onCommentEditCancel={clearCommentEdit}
                    onCommentEditChange={(commentId, value) =>
                      setCommentEdits((current) => ({
                        ...current,
                        [commentId]: value,
                      }))}
                    onCommentEditStart={startCommentEdit}
                    onCommentInputBlur={() => {
                      void sync.updateCursor(null);
                    }}
                    onCommentInputFocus={(task) => {
                      void sync.updateCursor(
                        createPresenceCursor({
                          kind: "comment",
                          taskId: task.id,
                          taskTitle: task.title,
                        }),
                      );
                    }}
                    onCommentSubmit={(taskId) => {
                      void handleCommentSubmit(taskId);
                    }}
                    onCommentUpdate={(comment) => {
                      void handleCommentUpdate(comment);
                    }}
                    onLoadMore={() => sync.loadMoreTasks()}
                    onDescriptionBlur={() => {
                      void sync.updateCursor(null);
                    }}
                    onDescriptionFocus={(task) => {
                      void sync.updateCursor(
                        createPresenceCursor({
                          kind: "description",
                          taskId: task.id,
                          taskTitle: task.title,
                        }),
                      );
                    }}
                    onTaskDelete={(task) => {
                      void handleTaskDelete(task);
                    }}
                    onTaskDescriptionPersist={(task, value) =>
                      handleTaskDescriptionPersist(task, value)}
                    onTaskStatusAdvance={(task) => {
                      void handleStatusAdvance(task);
                    }}
                    projectId={projectId}
                    shouldVirtualize={shouldVirtualizeTaskList}
                    tasks={snapshot.tasks}
                    tasksById={tasksById}
                    viewers={sync.viewers}
                  />
                )}
              </>
            )}
          </section>
        </div>

        <div className="workspace-side-column">
          <WorkspaceNotifications notifications={sync.notifications} />
          <WorkspaceActivityFeed activity={sync.activity} />
        </div>
      </div>

      <WorkspaceShortcuts
        onClose={() => setShowShortcuts(false)}
        open={showShortcuts}
      />
    </main>
  );
}
