import type {
  AppendEventInput,
  Comment,
  ProjectEvent,
  ProjectSnapshot,
  Task,
  TaskStatus,
} from "../../shared/types";

function extractMentions(content: string): string[] {
  const mentions = content.match(/@([a-zA-Z0-9_-]+)/g) ?? [];
  return [...new Set(mentions.map((mention) => mention.slice(1)))];
}

function sortSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    ...snapshot,
    tasks: [...snapshot.tasks].sort(
      (left, right) => left.position - right.position || left.id.localeCompare(right.id),
    ),
    comments: [...snapshot.comments].sort(
      (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
    ),
  };
}

function withVersion(
  snapshot: ProjectSnapshot,
  event: ProjectEvent,
): ProjectSnapshot {
  const version = Math.max(snapshot.version, event.version);

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      currentVersion: version,
      updatedAt: event.timestamp,
    },
    version,
  };
}

type ApplyOptions = {
  ignoreVersionGuard?: boolean;
};

export function applyProjectEvent(
  snapshot: ProjectSnapshot,
  event: ProjectEvent,
  options: ApplyOptions = {},
): ProjectSnapshot {
  if (!options.ignoreVersionGuard && event.version <= snapshot.version) {
    return snapshot;
  }

  switch (event.action.type) {
    case "project.create":
      return {
        project: {
          id: event.projectId,
          name: event.action.data.name,
          description: event.action.data.description,
          metadata: event.action.data.metadata ?? {},
          currentVersion: event.version,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        },
        tasks: [],
        comments: [],
        version: event.version,
      };
    case "project.update":
      return sortSnapshot(
        withVersion(
          {
            ...snapshot,
            project: {
              ...snapshot.project,
              ...(event.action.data.name !== undefined
                ? { name: event.action.data.name }
                : {}),
              ...(event.action.data.description !== undefined
                ? { description: event.action.data.description }
                : {}),
              ...(event.action.data.metadata !== undefined
                ? { metadata: event.action.data.metadata }
                : {}),
            },
          },
          event,
        ),
      );
    case "task.create": {
      const nextTask: Task = {
        id: event.entityId,
        projectId: event.projectId,
        title: event.action.data.title,
        status: event.action.data.status,
        assignedTo: event.action.data.assignedTo ?? [],
        configuration: event.action.data.configuration ?? {
          tags: [],
          customFields: {},
        },
        dependencies: event.action.data.dependencies ?? [],
        position: event.action.data.position ?? event.version,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };

      return sortSnapshot(
        withVersion(
          {
            ...snapshot,
            tasks: [
              ...snapshot.tasks.filter((task) => task.id !== event.entityId),
              nextTask,
            ],
          },
          event,
        ),
      );
    }
    case "task.update": {
      const existingTask = snapshot.tasks.find((task) => task.id === event.entityId);
      if (!existingTask) {
        return snapshot;
      }

      const nextTask: Task = {
        ...existingTask,
        ...(event.action.data.title !== undefined
          ? { title: event.action.data.title }
          : {}),
        ...(event.action.data.status !== undefined
          ? { status: event.action.data.status as TaskStatus }
          : {}),
        ...(event.action.data.assignedTo !== undefined
          ? { assignedTo: event.action.data.assignedTo }
          : {}),
        ...(event.action.data.configuration !== undefined
          ? { configuration: event.action.data.configuration }
          : {}),
        ...(event.action.data.dependencies !== undefined
          ? { dependencies: event.action.data.dependencies }
          : {}),
        ...(event.action.data.position !== undefined
          ? { position: event.action.data.position }
          : {}),
        updatedAt: event.timestamp,
      };

      return sortSnapshot(
        withVersion(
          {
            ...snapshot,
            tasks: snapshot.tasks.map((task) =>
              task.id === event.entityId ? nextTask : task,
            ),
          },
          event,
        ),
      );
    }
    case "task.delete":
      return sortSnapshot(
        withVersion(
          {
            ...snapshot,
            tasks: snapshot.tasks.filter((task) => task.id !== event.entityId),
            comments: snapshot.comments.filter((comment) => comment.taskId !== event.entityId),
          },
          event,
        ),
      );
    case "comment.create": {
      const nextComment: Comment = {
        id: event.entityId,
        taskId: event.action.data.taskId,
        content: event.action.data.content,
        author: event.action.data.author,
        mentions: extractMentions(event.action.data.content),
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };

      return sortSnapshot(
        withVersion(
          {
            ...snapshot,
            comments: [
              ...snapshot.comments.filter((comment) => comment.id !== event.entityId),
              nextComment,
            ],
          },
          event,
        ),
      );
    }
    case "comment.update": {
      const existingComment = snapshot.comments.find(
        (comment) => comment.id === event.entityId,
      );
      if (!existingComment) {
        return snapshot;
      }

      const content = event.action.data.content;

      return sortSnapshot(
        withVersion(
          {
            ...snapshot,
            comments: snapshot.comments.map((comment) =>
              comment.id === event.entityId
                ? {
                    ...existingComment,
                    content,
                    mentions: extractMentions(content),
                    updatedAt: event.timestamp,
                  }
                : comment,
            ),
          },
          event,
        ),
      );
    }
    case "comment.delete":
      return sortSnapshot(
        withVersion(
          {
            ...snapshot,
            comments: snapshot.comments.filter((comment) => comment.id !== event.entityId),
          },
          event,
        ),
      );
    case "presence.update":
      return snapshot;
  }
}

export function buildOptimisticEvent(
  snapshot: ProjectSnapshot,
  input: AppendEventInput,
): ProjectEvent {
  return {
    id: input.id,
    projectId: input.projectId,
    entityId: input.entityId,
    action: input.action,
    version: snapshot.version + 1,
    clientId: input.clientId,
    userId: input.userId,
    timestamp: input.timestamp,
    parentVersion: input.parentVersion,
  };
}

export function deriveVisibleSnapshot(
  snapshot: ProjectSnapshot,
  optimisticEvent: ProjectEvent | null,
): ProjectSnapshot {
  if (!optimisticEvent) {
    return snapshot;
  }

  return applyProjectEvent(snapshot, optimisticEvent, {
    ignoreVersionGuard: true,
  });
}
