import type { PresenceCursor, PresenceViewer } from "../shared/types";

export type CursorBadge = {
  clientId: string;
  userId: string;
  label: string;
  shortLabel: string;
};

type PresenceCursorInput = {
  kind: PresenceCursor["kind"];
  taskId: string;
  taskTitle: string;
};

function shortLabelForCursorKind(kind: PresenceCursor["kind"]): string {
  switch (kind) {
    case "comment":
      return "commenting";
    case "description":
      return "editing";
    case "board":
      return "dragging";
    case "task":
    default:
      return "viewing";
  }
}

function labelForCursorKind(
  kind: PresenceCursor["kind"],
  taskTitle: string,
): string {
  switch (kind) {
    case "comment":
      return `Commenting on ${taskTitle}`;
    case "description":
      return "Editing description";
    case "board":
      return `Moving ${taskTitle}`;
    case "task":
    default:
      return `Viewing ${taskTitle}`;
  }
}

export function createPresenceCursor(input: PresenceCursorInput): PresenceCursor {
  return {
    kind: input.kind,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    label: labelForCursorKind(input.kind, input.taskTitle),
  };
}

export function describePresenceCursor(cursor: PresenceCursor): string {
  return cursor.label;
}

export function buildTaskCursorBadges(
  viewers: PresenceViewer[],
  taskId: string,
): CursorBadge[] {
  return viewers
    .filter((viewer) => viewer.cursor?.taskId === taskId)
    .map((viewer) => ({
      clientId: viewer.clientId,
      userId: viewer.userId,
      label: describePresenceCursor(viewer.cursor!),
      shortLabel: shortLabelForCursorKind(viewer.cursor!.kind),
    }));
}
