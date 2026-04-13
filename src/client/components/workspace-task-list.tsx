"use client";

import dynamic from "next/dynamic";

import type { Comment, PresenceViewer, Task } from "../../shared/types";
import { buildTaskCursorBadges } from "../cursors";
import { VirtualTaskList } from "./virtual-task-list";
import { buildTaskCardViewModel } from "./workspace-task-card";
import { formatTaskStatusLabel } from "./workspace-dependencies";

const TaskDescriptionEditor = dynamic(
  () =>
    import("./task-description-editor").then((module) => module.TaskDescriptionEditor),
  {
    ssr: false,
    loading: () => (
      <textarea
        aria-label="Task description"
        className="text-input task-description-input"
        disabled
        placeholder="Loading collaborative description"
        rows={3}
      />
    ),
  },
);

type WorkspaceTaskListProps = {
  canMutate: boolean;
  clientId: string;
  commentDrafts: Record<string, string>;
  commentEdits: Record<string, string>;
  commentsByTask: Map<string, Comment[]>;
  editingCommentId: string | null;
  hasMoreTasks: boolean;
  isLoadingMoreTasks: boolean;
  normalizedDisplayName: string;
  onCommentDelete: (comment: Comment) => void;
  onCommentDraftChange: (taskId: string, value: string) => void;
  onCommentEditCancel: (commentId: string) => void;
  onCommentEditChange: (commentId: string, value: string) => void;
  onCommentEditStart: (comment: Comment) => void;
  onCommentInputBlur: () => void;
  onCommentInputFocus: (task: Task) => void;
  onCommentSubmit: (taskId: string) => void;
  onCommentUpdate: (comment: Comment) => void;
  onLoadMore: () => Promise<void>;
  onDescriptionBlur: () => void;
  onDescriptionFocus: (task: Task) => void;
  onTaskDelete: (task: Task) => void;
  onTaskDescriptionPersist: (task: Task, value: string) => Promise<void>;
  onTaskStatusAdvance: (task: Task) => void;
  projectId: string;
  shouldVirtualize: boolean;
  tasks: Task[];
  tasksById: Map<string, Task>;
  viewers: PresenceViewer[];
};

type TaskCardProps = {
  canMutate: boolean;
  clientId: string;
  commentDrafts: Record<string, string>;
  commentEdits: Record<string, string>;
  comments: Comment[];
  editingCommentId: string | null;
  normalizedDisplayName: string;
  onCommentDelete: (comment: Comment) => void;
  onCommentDraftChange: (taskId: string, value: string) => void;
  onCommentEditCancel: (commentId: string) => void;
  onCommentEditChange: (commentId: string, value: string) => void;
  onCommentEditStart: (comment: Comment) => void;
  onCommentInputBlur: () => void;
  onCommentInputFocus: (task: Task) => void;
  onCommentSubmit: (taskId: string) => void;
  onCommentUpdate: (comment: Comment) => void;
  onDescriptionBlur: () => void;
  onDescriptionFocus: (task: Task) => void;
  onTaskDelete: (task: Task) => void;
  onTaskDescriptionPersist: (task: Task, value: string) => Promise<void>;
  onTaskStatusAdvance: (task: Task) => void;
  projectId: string;
  task: Task;
  tasksById: Map<string, Task>;
  viewers: PresenceViewer[];
};

function TaskCard({
  canMutate,
  clientId,
  commentDrafts,
  commentEdits,
  comments,
  editingCommentId,
  normalizedDisplayName,
  onCommentDelete,
  onCommentDraftChange,
  onCommentEditCancel,
  onCommentEditChange,
  onCommentEditStart,
  onCommentInputBlur,
  onCommentInputFocus,
  onCommentSubmit,
  onCommentUpdate,
  onDescriptionBlur,
  onDescriptionFocus,
  onTaskDelete,
  onTaskDescriptionPersist,
  onTaskStatusAdvance,
  projectId,
  task,
  tasksById,
  viewers,
}: TaskCardProps) {
  const taskCard = buildTaskCardViewModel(task);
  const cursorBadges = buildTaskCursorBadges(viewers, task.id);

  return (
    <article className="task-card">
      <div className="task-card-header">
        <div className="task-card-copy">
          <h2>{task.title}</h2>
          <p className="subtle-copy">Task {task.id.slice(0, 8)}</p>
          <TaskDescriptionEditor
            canEdit={canMutate}
            clientId={clientId}
            onBlur={onDescriptionBlur}
            onFocus={() => onDescriptionFocus(task)}
            onPersist={(value) => onTaskDescriptionPersist(task, value)}
            projectId={projectId}
            taskId={task.id}
          />
          {task.dependencies.length > 0 ? (
            <p className="dependency-copy">
              Blocked by:{" "}
              {task.dependencies
                .map((dependencyId) => tasksById.get(dependencyId)?.title ?? dependencyId)
                .join(", ")}
            </p>
          ) : null}
          {cursorBadges.length > 0 ? (
            <div className="task-cursor-badges">
              {cursorBadges.map((badge) => (
                <span
                  className="viewer-chip viewer-chip-active"
                  key={`${task.id}-${badge.clientId}`}
                >
                  {badge.userId} is {badge.shortLabel}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="task-card-actions">
          <button
            className="status-button"
            disabled={!canMutate}
            onClick={() => onTaskStatusAdvance(task)}
            type="button"
          >
            {formatTaskStatusLabel(task.status)}
          </button>

          <button
            aria-label="Delete task"
            className="secondary-button danger-button"
            disabled={!canMutate}
            onClick={() => onTaskDelete(task)}
            type="button"
          >
            Delete task
          </button>
        </div>
      </div>

      {taskCard.priorityLabel || taskCard.assigneeSummary || taskCard.tagSummary.length > 0 ? (
        <div className="task-meta">
          {taskCard.priorityLabel ? (
            <span className="task-meta-pill">
              Priority: {taskCard.priorityLabel}
            </span>
          ) : null}
          {taskCard.assigneeSummary ? (
            <span className="task-meta-pill">
              Owners: {taskCard.assigneeSummary}
            </span>
          ) : null}
          {taskCard.tagSummary.map((tag) => (
            <span className="task-meta-pill task-tag-pill" key={`${task.id}-${tag}`}>
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="comment-list">
        {comments.map((comment) => (
          <div className="comment-item" key={comment.id}>
            <div className="comment-header">
              <strong>{comment.author}</strong>

              {comment.author === normalizedDisplayName ? (
                <div className="comment-actions">
                  {editingCommentId === comment.id ? (
                    <>
                      <button
                        className="secondary-button"
                        disabled={!canMutate}
                        onClick={() => onCommentUpdate(comment)}
                        type="button"
                      >
                        Save comment
                      </button>
                      <button
                        className="secondary-button"
                        disabled={!canMutate}
                        onClick={() => onCommentEditCancel(comment.id)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="secondary-button"
                      disabled={!canMutate}
                      onClick={() => onCommentEditStart(comment)}
                      type="button"
                    >
                      Edit comment
                    </button>
                  )}
                  <button
                    className="secondary-button danger-button"
                    disabled={!canMutate}
                    onClick={() => onCommentDelete(comment)}
                    type="button"
                  >
                    Delete comment
                  </button>
                </div>
              ) : null}
            </div>

            {editingCommentId === comment.id ? (
              <input
                aria-label="Edit comment"
                className="text-input"
                disabled={!canMutate}
                onChange={(event) => onCommentEditChange(comment.id, event.target.value)}
                value={commentEdits[comment.id] ?? ""}
              />
            ) : (
              <p>{comment.content}</p>
            )}
          </div>
        ))}
      </div>

      <div className="comment-composer">
        <input
          className="text-input"
          disabled={!canMutate}
          onBlur={onCommentInputBlur}
          onChange={(event) => onCommentDraftChange(task.id, event.target.value)}
          onFocus={() => onCommentInputFocus(task)}
          placeholder="Add a comment with @mentions"
          value={commentDrafts[task.id] ?? ""}
        />

        <button
          className="secondary-button"
          disabled={!canMutate}
          onClick={() => onCommentSubmit(task.id)}
          type="button"
        >
          Comment
        </button>
      </div>
    </article>
  );
}

export function WorkspaceTaskList({
  canMutate,
  clientId,
  commentDrafts,
  commentEdits,
  commentsByTask,
  editingCommentId,
  hasMoreTasks,
  isLoadingMoreTasks,
  normalizedDisplayName,
  onCommentDelete,
  onCommentDraftChange,
  onCommentEditCancel,
  onCommentEditChange,
  onCommentEditStart,
  onCommentInputBlur,
  onCommentInputFocus,
  onCommentSubmit,
  onCommentUpdate,
  onLoadMore,
  onDescriptionBlur,
  onDescriptionFocus,
  onTaskDelete,
  onTaskDescriptionPersist,
  onTaskStatusAdvance,
  projectId,
  shouldVirtualize,
  tasks,
  tasksById,
  viewers,
}: WorkspaceTaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="panel">
        <p className="subtle-copy">
          No tasks yet. Add one above, then open the same page in another tab to
          watch it appear over the event stream.
        </p>
      </div>
    );
  }

  const renderTask = (task: Task) => (
    <TaskCard
      canMutate={canMutate}
      clientId={clientId}
      commentDrafts={commentDrafts}
      commentEdits={commentEdits}
      comments={commentsByTask.get(task.id) ?? []}
      editingCommentId={editingCommentId}
      key={task.id}
      normalizedDisplayName={normalizedDisplayName}
      onCommentDelete={onCommentDelete}
      onCommentDraftChange={onCommentDraftChange}
      onCommentEditCancel={onCommentEditCancel}
      onCommentEditChange={onCommentEditChange}
      onCommentEditStart={onCommentEditStart}
      onCommentInputBlur={onCommentInputBlur}
      onCommentInputFocus={onCommentInputFocus}
      onCommentSubmit={onCommentSubmit}
      onCommentUpdate={onCommentUpdate}
      onDescriptionBlur={onDescriptionBlur}
      onDescriptionFocus={onDescriptionFocus}
      onTaskDelete={onTaskDelete}
      onTaskDescriptionPersist={onTaskDescriptionPersist}
      onTaskStatusAdvance={onTaskStatusAdvance}
      projectId={projectId}
      task={task}
      tasksById={tasksById}
      viewers={viewers}
    />
  );

  if (shouldVirtualize) {
    return (
      <VirtualTaskList
        hasMore={hasMoreTasks}
        isLoadingMore={isLoadingMoreTasks}
        items={tasks}
        onLoadMore={onLoadMore}
        renderItem={renderTask}
      />
    );
  }

  return <>{tasks.map(renderTask)}</>;
}
