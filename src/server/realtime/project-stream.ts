import type { ProjectEvent } from "../../shared/types";
import { getProjectEventBus } from "./event-bus";

export function publishProjectEvent(event: ProjectEvent): void {
  getProjectEventBus().publish(event);
}

export function subscribeToProjectEvents(
  projectId: string,
  listener: (event: ProjectEvent) => void,
): () => void {
  return getProjectEventBus().subscribe(projectId, listener);
}
