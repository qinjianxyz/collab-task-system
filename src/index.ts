export const packageName = "@enterprise-os/collab-task-system";

export {
  appendEventInputSchema,
  commentSchema,
  eventActionSchema,
  projectEventSchema,
  projectSchema,
  projectSnapshotSchema,
  taskSchema,
  taskStatusSchema,
} from "./shared/types";

export type {
  AppendEventInput,
  Comment,
  EventAction,
  Project,
  ProjectEvent,
  ProjectSnapshot,
  Task,
  TaskConfig,
  TaskPriority,
  TaskStatus,
} from "./shared/types";

export {
  ConcurrencyConflictError,
  DependencyCycleError,
  DomainError,
  InvalidStatusTransitionError,
} from "./server/domain/errors";

export { detectDependencyCycle } from "./server/domain/dependencies";
export { assertTaskStatusTransitionAllowed } from "./server/domain/transitions";
export { appendEvent, getProjectVersion } from "./server/events/event-store";
export { getEventsSince } from "./server/events/event-store";
export { replayProjectEvents } from "./server/domain/replay";
export { getSnapshot, rebuildProjectProjection } from "./server/events/snapshot";
