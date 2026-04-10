import type { TaskStatus } from "../../shared/types";

import { InvalidStatusTransitionError } from "./errors";

type DependencyState =
  | TaskStatus
  | {
      id?: string;
      status: TaskStatus;
      title?: string;
    };

export function assertTaskStatusTransitionAllowed(
  nextStatus: TaskStatus,
  dependencies: DependencyState[],
): void {
  if (nextStatus !== "in_progress") {
    return;
  }

  const blockingDependency = dependencies.find((dependency) =>
    (typeof dependency === "string" ? dependency : dependency.status) !== "done",
  );

  if (blockingDependency) {
    const dependencyLabel =
      typeof blockingDependency === "string"
        ? null
        : blockingDependency.title ?? blockingDependency.id ?? null;

    throw new InvalidStatusTransitionError(
      dependencyLabel
        ? `Blocked: dependency "${dependencyLabel}" must be completed first.`
        : "task cannot move to in_progress until all dependencies are done",
    );
  }
}
