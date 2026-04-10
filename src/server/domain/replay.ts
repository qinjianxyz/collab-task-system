import type {
  Comment,
  Project,
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

export function replayProjectEvents(events: ProjectEvent[]): ProjectSnapshot {
  let project: Project | null = null;
  const tasks = new Map<string, Task>();
  const comments = new Map<string, Comment>();
  let version = 0;

  for (const event of events) {
    version = event.version;

    switch (event.action.type) {
      case "project.create":
        project = {
          id: event.projectId,
          name: event.action.data.name,
          description: event.action.data.description,
          metadata: event.action.data.metadata ?? {},
          currentVersion: event.version,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
        break;
      case "project.update":
        if (!project) {
          throw new Error("cannot replay project.update before project.create");
        }

        const currentProject: Project = project;
        project = {
          ...currentProject,
          ...(event.action.data.name !== undefined
            ? { name: event.action.data.name }
            : {}),
          ...(event.action.data.description !== undefined
            ? { description: event.action.data.description }
            : {}),
          ...(event.action.data.metadata !== undefined
            ? { metadata: event.action.data.metadata }
            : {}),
          currentVersion: event.version,
          updatedAt: event.timestamp,
        };
        break;
      case "task.create":
        tasks.set(event.entityId, {
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
        });
        break;
      case "task.update": {
        const task = tasks.get(event.entityId);
        if (!task) {
          throw new Error(`cannot replay task.update for missing task ${event.entityId}`);
        }

        tasks.set(event.entityId, {
          ...task,
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
        });
        break;
      }
      case "task.delete":
        tasks.delete(event.entityId);
        break;
      case "comment.create":
        comments.set(event.entityId, {
          id: event.entityId,
          taskId: event.action.data.taskId,
          content: event.action.data.content,
          author: event.action.data.author,
          mentions: extractMentions(event.action.data.content),
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        });
        break;
      case "comment.update": {
        const comment = comments.get(event.entityId);
        if (!comment) {
          throw new Error(
            `cannot replay comment.update for missing comment ${event.entityId}`,
          );
        }

        comments.set(event.entityId, {
          ...comment,
          content: event.action.data.content,
          mentions: extractMentions(event.action.data.content),
          updatedAt: event.timestamp,
        });
        break;
      }
      case "comment.delete":
        comments.delete(event.entityId);
        break;
      case "presence.update":
        break;
    }

    if (project && event.action.type !== "project.update") {
      project = {
        ...project,
        currentVersion: event.version,
        updatedAt: event.timestamp,
      };
    }
  }

  if (!project) {
    throw new Error("cannot replay an empty project stream");
  }

  return sortSnapshot({
    project,
    tasks: [...tasks.values()],
    comments: [...comments.values()],
    version,
  });
}
