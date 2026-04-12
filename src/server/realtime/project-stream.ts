import type { ProjectEvent } from "../../shared/types";

import { getProjectEventBus } from "./event-bus";

type ProjectEventListener = (event: ProjectEvent) => void;

export function publishProjectEvent(event: ProjectEvent): void {
  getProjectEventBus().publish(event);
}

export async function subscribeToProjectEvents(
  projectId: string,
  listener: ProjectEventListener,
): Promise<() => void> {
  return getProjectEventBus().subscribe(projectId, listener);
}
