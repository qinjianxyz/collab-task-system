import type {
  AppendEventInput,
  Comment,
  LoadedProjectSnapshot,
  ProjectEvent,
  ProjectTaskPage,
  ProjectSnapshot,
  Task,
  TaskStatus,
} from "../../shared/types";

export type ReducerSnapshot = ProjectSnapshot | LoadedProjectSnapshot;

function extractMentions(content: string): string[] {
  const mentions = content.match(/@([a-zA-Z0-9_-]+)/g) ?? [];
  return [...new Set(mentions.map((mention) => mention.slice(1)))];
}

function isLoadedSnapshot(snapshot: ReducerSnapshot): snapshot is LoadedProjectSnapshot {
  return "taskPage" in snapshot;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (left, right) => left.position - right.position || left.id.localeCompare(right.id),
  );
}

function sortComments(comments: Comment[]): Comment[] {
  return [...comments].sort(
    (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
}

function sortSnapshot<T extends ReducerSnapshot>(snapshot: T): T {
  const tasks = sortTasks(snapshot.tasks);
  const comments = sortComments(snapshot.comments);

  if (isLoadedSnapshot(snapshot)) {
    return {
      ...snapshot,
      tasks,
      comments,
      taskPage: {
        ...snapshot.taskPage,
        tasks,
        comments,
      },
    } as T;
  }

  return {
    ...snapshot,
    tasks,
    comments,
  } as T;
}

function withVersion<T extends ReducerSnapshot>(
  snapshot: T,
  event: ProjectEvent,
): T {
  const version = Math.max(snapshot.version, event.version);

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      currentVersion: version,
      updatedAt: event.timestamp,
    },
    version,
  } as T;
}

function withTaskPageMeta(
  snapshot: LoadedProjectSnapshot,
  overrides: Partial<Omit<ProjectTaskPage, "tasks" | "comments">>,
): LoadedProjectSnapshot {
  return {
    ...snapshot,
    taskPage: {
      ...snapshot.taskPage,
      tasks: snapshot.tasks,
      comments: snapshot.comments,
      ...overrides,
    },
  };
}

function compareTasks(left: Pick<Task, "id" | "position">, right: Pick<Task, "id" | "position">): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

type ApplyOptions = {
  ignoreVersionGuard?: boolean;
};

export function applyProjectEvent<T extends ReducerSnapshot>(
  snapshot: T,
  event: ProjectEvent,
  options: ApplyOptions = {},
): T {
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
      } as unknown as T;
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

      if (isLoadedSnapshot(snapshot)) {
        const alreadyLoaded = snapshot.tasks.some((task) => task.id === event.entityId);
        const nextTotalCount = alreadyLoaded
          ? snapshot.taskPage.totalCount
          : snapshot.taskPage.totalCount + 1;
        const lastLoadedTask = snapshot.tasks.at(-1);

        if (
          snapshot.taskPage.hasMore &&
          lastLoadedTask &&
          compareTasks(nextTask, lastLoadedTask) > 0
        ) {
          return sortSnapshot(
            withVersion(
              withTaskPageMeta(snapshot, {
                totalCount: nextTotalCount,
              }),
              event,
            ),
          ) as T;
        }

        return sortSnapshot(
          withVersion(
            withTaskPageMeta(
              {
                ...snapshot,
                tasks: [
                  ...snapshot.tasks.filter((task) => task.id !== event.entityId),
                  nextTask,
                ],
              } as LoadedProjectSnapshot,
              {
                totalCount: nextTotalCount,
              },
            ),
            event,
          ),
        ) as T;
      }

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
        return sortSnapshot(withVersion(snapshot, event));
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
    case "task.delete": {
      if (isLoadedSnapshot(snapshot)) {
        const nextTasks = snapshot.tasks.filter((task) => task.id !== event.entityId);
        const nextComments = snapshot.comments.filter((comment) => comment.taskId !== event.entityId);
        const nextTotalCount = Math.max(0, snapshot.taskPage.totalCount - 1);

        return sortSnapshot(
          withVersion(
            withTaskPageMeta(
              {
                ...snapshot,
                tasks: nextTasks,
                comments: nextComments,
              } as LoadedProjectSnapshot,
              {
                totalCount: nextTotalCount,
                hasMore: nextTotalCount > nextTasks.length,
                nextCursor:
                  nextTotalCount > nextTasks.length ? snapshot.taskPage.nextCursor : null,
              },
            ),
            event,
          ),
        ) as T;
      }

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
    }
    case "comment.create": {
      const actionData = event.action.data as Extract<
        ProjectEvent["action"],
        { type: "comment.create" }
      >["data"];

      if (
        isLoadedSnapshot(snapshot) &&
        !snapshot.tasks.some((task) => task.id === actionData.taskId)
      ) {
        return sortSnapshot(withVersion(snapshot, event));
      }

      const nextComment: Comment = {
        id: event.entityId,
        taskId: actionData.taskId,
        content: actionData.content,
        author: actionData.author,
        mentions: extractMentions(actionData.content),
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
        return sortSnapshot(withVersion(snapshot, event));
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
      if (
        isLoadedSnapshot(snapshot) &&
        !snapshot.comments.some((comment) => comment.id === event.entityId)
      ) {
        return sortSnapshot(withVersion(snapshot, event));
      }

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
  snapshot: ReducerSnapshot,
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

export function deriveVisibleSnapshot<T extends ReducerSnapshot>(
  snapshot: T,
  optimisticEvent: ProjectEvent | null,
): T {
  if (!optimisticEvent) {
    return snapshot;
  }

  return applyProjectEvent(snapshot, optimisticEvent, {
    ignoreVersionGuard: true,
  });
}

export function mergeTaskPage(
  snapshot: LoadedProjectSnapshot,
  page: ProjectTaskPage,
): LoadedProjectSnapshot {
  const tasks = new Map(snapshot.tasks.map((task) => [task.id, task]));
  for (const task of page.tasks) {
    tasks.set(task.id, task);
  }

  const comments = new Map(snapshot.comments.map((comment) => [comment.id, comment]));
  for (const comment of page.comments) {
    comments.set(comment.id, comment);
  }

  return sortSnapshot({
    ...snapshot,
    tasks: [...tasks.values()],
    comments: [...comments.values()],
    taskPage: {
      ...snapshot.taskPage,
      tasks: [...tasks.values()],
      comments: [...comments.values()],
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      totalCount: page.totalCount,
    },
  }) as LoadedProjectSnapshot;
}
