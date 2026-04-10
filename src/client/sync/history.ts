import type { EventAction, ProjectEvent, ProjectSnapshot } from "../../shared/types";

export type HistoryAction = {
  entityId: string;
  action: EventAction;
};

export type HistoryEntry = {
  targetVersion: number;
  undoAction: HistoryAction;
  redoAction: HistoryAction;
};

function pickProjectUndoData(
  snapshot: ProjectSnapshot,
  event: ProjectEvent,
): EventAction | null {
  if (event.action.type !== "project.update") {
    return null;
  }

  const data = {
    ...(event.action.data.name !== undefined ? { name: snapshot.project.name } : {}),
    ...(event.action.data.description !== undefined
      ? { description: snapshot.project.description }
      : {}),
    ...(event.action.data.metadata !== undefined ? { metadata: snapshot.project.metadata } : {}),
  };

  if (Object.keys(data).length === 0) {
    return null;
  }

  return {
    type: "project.update",
    data,
  };
}

export function createHistoryEntry(
  snapshot: ProjectSnapshot,
  committedEvent: ProjectEvent,
): HistoryEntry | null {
  switch (committedEvent.action.type) {
    case "project.create":
    case "presence.update":
      return null;
    case "project.update": {
      const undoAction = pickProjectUndoData(snapshot, committedEvent);
      if (!undoAction) {
        return null;
      }

      return {
        targetVersion: committedEvent.version,
        undoAction: {
          entityId: committedEvent.entityId,
          action: undoAction,
        },
        redoAction: {
          entityId: committedEvent.entityId,
          action: committedEvent.action,
        },
      };
    }
    case "task.create":
      return {
        targetVersion: committedEvent.version,
        undoAction: {
          entityId: committedEvent.entityId,
          action: {
            type: "task.delete",
            data: {},
          },
        },
        redoAction: {
          entityId: committedEvent.entityId,
          action: committedEvent.action,
        },
      };
    case "task.update": {
      const task = snapshot.tasks.find((candidate) => candidate.id === committedEvent.entityId);
      if (!task) {
        return null;
      }

      const undoData = {
        ...(committedEvent.action.data.title !== undefined ? { title: task.title } : {}),
        ...(committedEvent.action.data.status !== undefined ? { status: task.status } : {}),
        ...(committedEvent.action.data.assignedTo !== undefined
          ? { assignedTo: task.assignedTo }
          : {}),
        ...(committedEvent.action.data.configuration !== undefined
          ? { configuration: task.configuration }
          : {}),
        ...(committedEvent.action.data.dependencies !== undefined
          ? { dependencies: task.dependencies }
          : {}),
        ...(committedEvent.action.data.position !== undefined ? { position: task.position } : {}),
      };

      if (Object.keys(undoData).length === 0) {
        return null;
      }

      return {
        targetVersion: committedEvent.version,
        undoAction: {
          entityId: committedEvent.entityId,
          action: {
            type: "task.update",
            data: undoData,
          },
        },
        redoAction: {
          entityId: committedEvent.entityId,
          action: committedEvent.action,
        },
      };
    }
    case "task.delete": {
      const task = snapshot.tasks.find((candidate) => candidate.id === committedEvent.entityId);
      if (!task) {
        return null;
      }

      return {
        targetVersion: committedEvent.version,
        undoAction: {
          entityId: committedEvent.entityId,
          action: {
            type: "task.create",
            data: {
              title: task.title,
              status: task.status,
              projectId: task.projectId,
              assignedTo: task.assignedTo,
              configuration: task.configuration,
              dependencies: task.dependencies,
              position: task.position,
            },
          },
        },
        redoAction: {
          entityId: committedEvent.entityId,
          action: committedEvent.action,
        },
      };
    }
    case "comment.create":
      return {
        targetVersion: committedEvent.version,
        undoAction: {
          entityId: committedEvent.entityId,
          action: {
            type: "comment.delete",
            data: {},
          },
        },
        redoAction: {
          entityId: committedEvent.entityId,
          action: committedEvent.action,
        },
      };
    case "comment.update": {
      const comment = snapshot.comments.find(
        (candidate) => candidate.id === committedEvent.entityId,
      );
      if (!comment) {
        return null;
      }

      return {
        targetVersion: committedEvent.version,
        undoAction: {
          entityId: committedEvent.entityId,
          action: {
            type: "comment.update",
            data: {
              content: comment.content,
            },
          },
        },
        redoAction: {
          entityId: committedEvent.entityId,
          action: committedEvent.action,
        },
      };
    }
    case "comment.delete": {
      const comment = snapshot.comments.find(
        (candidate) => candidate.id === committedEvent.entityId,
      );
      if (!comment) {
        return null;
      }

      return {
        targetVersion: committedEvent.version,
        undoAction: {
          entityId: committedEvent.entityId,
          action: {
            type: "comment.create",
            data: {
              taskId: comment.taskId,
              content: comment.content,
              author: comment.author,
            },
          },
        },
        redoAction: {
          entityId: committedEvent.entityId,
          action: committedEvent.action,
        },
      };
    }
  }
}
