import type { ProjectEvent } from "../../shared/types";

import { getProjectEventBus } from "./event-bus";

type ProjectEventListener = (event: ProjectEvent) => void;

export function publishProjectEvent(event: ProjectEvent): void {
  getProjectEventBus().publish(event);
}

export function subscribeToProjectEvents(
  projectId: string,
  listener: ProjectEventListener,
): () => void {
  return getProjectEventBus().subscribe(projectId, listener);
}
