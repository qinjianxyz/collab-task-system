"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import {
  type ApiError,
  appendProjectEvent,
  fetchProjectEvents,
  fetchProjectNotifications,
  fetchProjectSnapshot,
  fetchProjectTaskPage,
  updateProjectPresence,
} from "../api";
import { applyActivityEvent, buildActivityFeed, type ActivityItem } from "../sync/activity";
import { applyNotificationEvent, sortNotifications } from "../sync/notifications";
import { createHistoryEntry, type HistoryEntry } from "../sync/history";
import { buildOptimisticEvent, deriveVisibleSnapshot, applyProjectEvent } from "../sync/reducer";
import type { ProjectTaskPageResponse } from "../../shared/api";
import type {
  AppendEventInput,
  EventAction,
  MentionNotification,
  PresenceCursor,
  PresenceViewer,
  ProjectEvent,
  ProjectSnapshot,
} from "../../shared/types";

type ConnectionStatus = "loading" | "connected" | "reconnecting";

type Identity = {
  clientId: string;
  userId: string;
};

type PendingMutation = {
  input: AppendEventInput;
  optimisticEvent: ProjectEvent;
};

type DispatchInput = {
  entityId: string;
  action: EventAction;
  parentVersion?: number;
};

type UseProjectSyncResult = {
  activity: ActivityItem[];
  canRedo: boolean;
  canUndo: boolean;
  connectionStatus: ConnectionStatus;
  dispatch: (input: DispatchInput) => Promise<ProjectEvent>;
  error: string | null;
  hasMoreTasks: boolean;
  isMutating: boolean;
  isLoadingMoreTasks: boolean;
  loadMoreTasks: () => Promise<void>;
  notifications: MentionNotification[];
  refresh: () => Promise<void>;
  redo: () => Promise<void>;
  snapshot: ProjectSnapshot | null;
  totalTaskCount: number;
  undo: () => Promise<void>;
  updateCursor: (cursor: PresenceCursor | null) => Promise<void>;
  viewers: PresenceViewer[];
};

type DispatchOptions = {
  clearRedoStack?: boolean;
  recordHistory?: boolean;
};

type TaskWindowState = {
  hasMoreTasks: boolean;
  isLoadingMoreTasks: boolean;
  nextTaskCursor: string | null;
  totalTaskCount: number;
};

type InitialTaskPage = ProjectTaskPageResponse["page"];

const TASK_PAGE_SIZE = 32;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "unexpected sync error";
}

function isConflictError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && "status" in error && error.status === 409;
}

function applyEvents(
  snapshot: ProjectSnapshot | null,
  events: ProjectEvent[],
): ProjectSnapshot | null {
  if (!snapshot) {
    return snapshot;
  }

  return events.reduce((current, event) => applyProjectEvent(current, event), snapshot);
}

function trimHistory(entries: HistoryEntry[], limit = 50): HistoryEntry[] {
  return entries.slice(-limit);
}

function mergeTaskPage(
  snapshot: ProjectSnapshot,
  page: InitialTaskPage,
): ProjectSnapshot {
  const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task]));
  const commentsById = new Map(snapshot.comments.map((comment) => [comment.id, comment]));

  for (const task of page.tasks) {
    tasksById.set(task.id, task);
  }

  for (const comment of page.comments) {
    commentsById.set(comment.id, comment);
  }

  return {
    ...snapshot,
    tasks: [...tasksById.values()].sort(
      (left, right) => left.position - right.position || left.id.localeCompare(right.id),
    ),
    comments: [...commentsById.values()].sort(
      (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
    ),
  };
}

function updateTotalTaskCount(totalCount: number, event: ProjectEvent): number {
  switch (event.action.type) {
    case "task.create":
      return totalCount + 1;
    case "task.delete":
      return Math.max(0, totalCount - 1);
    default:
      return totalCount;
  }
}

export function useProjectSync(
  projectId: string,
  identity: Identity,
  initialSnapshot: ProjectSnapshot | null = null,
  initialTaskPage: InitialTaskPage | null = null,
): UseProjectSyncResult {
  const [serverSnapshot, setServerSnapshot] = useState<ProjectSnapshot | null>(initialSnapshot);
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [notifications, setNotifications] = useState<MentionNotification[]>([]);
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [taskWindow, setTaskWindow] = useState<TaskWindowState>({
    hasMoreTasks: initialTaskPage?.hasMore ?? false,
    isLoadingMoreTasks: false,
    nextTaskCursor: initialTaskPage?.nextCursor ?? null,
    totalTaskCount: initialTaskPage?.totalCount ?? initialSnapshot?.tasks.length ?? 0,
  });

  const snapshotRef = useRef<ProjectSnapshot | null>(initialSnapshot);
  const pendingMutationRef = useRef<PendingMutation | null>(null);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const lastVersionRef = useRef(initialSnapshot?.version ?? 0);
  const taskWindowRef = useRef(taskWindow);
  const lastCursorPayloadRef = useRef("");

  useEffect(() => {
    snapshotRef.current = serverSnapshot;
    lastVersionRef.current = serverSnapshot?.version ?? 0;
  }, [serverSnapshot]);

  useEffect(() => {
    pendingMutationRef.current = pendingMutation;
  }, [pendingMutation]);

  useEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

  useEffect(() => {
    redoStackRef.current = redoStack;
  }, [redoStack]);

  useEffect(() => {
    taskWindowRef.current = taskWindow;
  }, [taskWindow]);

  const applyCommittedEvent = useEffectEvent((event: ProjectEvent) => {
    if (snapshotRef.current && event.version <= snapshotRef.current.version) {
      return;
    }

    startTransition(() => {
      setServerSnapshot((current) => (current ? applyProjectEvent(current, event) : current));
      setActivity((current) => applyActivityEvent(current, event));
      setNotifications((current) =>
        applyNotificationEvent(current, event, identity.userId.trim(), snapshotRef.current),
      );
      setTaskWindow((current) => ({
        ...current,
        totalTaskCount: updateTotalTaskCount(current.totalTaskCount, event),
      }));
      setPendingMutation((current) =>
        current?.input.id === event.id ? null : current,
      );
      setError(null);
    });
  });

  const refreshSnapshot = useEffectEvent(async (): Promise<ProjectSnapshot> => {
    const response = await fetchProjectSnapshot(projectId);
    const recentEventsResponse = await fetchProjectEvents(
      projectId,
      Math.max(0, response.snapshot.version - 50),
    );
    const notificationsResponse = identity.userId.trim()
      ? await fetchProjectNotifications(projectId, identity.userId.trim())
      : { notifications: [] };

    startTransition(() => {
      setServerSnapshot(response.snapshot);
      setPendingMutation(null);
      setActivity(buildActivityFeed(recentEventsResponse.events));
      setNotifications(sortNotifications(notificationsResponse.notifications));
      setTaskWindow({
        hasMoreTasks: response.page?.hasMore ?? false,
        isLoadingMoreTasks: false,
        nextTaskCursor: response.page?.nextCursor ?? null,
        totalTaskCount: response.page?.totalCount ?? response.snapshot.tasks.length,
      });
      setViewers([]);
      setError(null);
    });

    return response.snapshot;
  });

  useEffect(() => {
    let isActive = true;
    let eventSource: EventSource | null = null;
    const normalizedUserId = identity.userId.trim();

    const connect = async () => {
      setConnectionStatus(snapshotRef.current ? "reconnecting" : "loading");

      try {
        if (!snapshotRef.current) {
          const snapshot = await refreshSnapshot();
          if (!isActive) {
            return;
          }

          lastVersionRef.current = snapshot.version;
        } else {
          const eventsResponse = await fetchProjectEvents(
            projectId,
            Math.max(0, snapshotRef.current.version - 50),
          );
          const notificationsResponse = normalizedUserId
            ? await fetchProjectNotifications(projectId, normalizedUserId)
            : { notifications: [] };
          if (!isActive) {
            return;
          }

          startTransition(() => {
            setActivity(buildActivityFeed(eventsResponse.events));
            setNotifications(sortNotifications(notificationsResponse.notifications));
            setError(null);
          });
        }

        const streamUrl = new URL(`/api/projects/${projectId}/stream`, window.location.origin);
        if (identity.clientId && normalizedUserId) {
          streamUrl.searchParams.set("clientId", identity.clientId);
          streamUrl.searchParams.set("userId", normalizedUserId);
          streamUrl.searchParams.set("location", "project");
        }

        eventSource = new EventSource(streamUrl.toString());
        eventSource.onopen = () => {
          if (isActive) {
            setConnectionStatus("connected");
          }
        };

        eventSource.onerror = () => {
          if (isActive) {
            setConnectionStatus("reconnecting");
          }
        };

        eventSource.addEventListener("version", async (message) => {
          if (!isActive) {
            return;
          }

          const payload = JSON.parse((message as MessageEvent<string>).data) as {
            version: number;
          };

          if (payload.version > lastVersionRef.current) {
            try {
              const eventsResponse = await fetchProjectEvents(projectId, lastVersionRef.current);
              if (!isActive) {
                return;
              }

              startTransition(() => {
                setServerSnapshot((current) => applyEvents(current, eventsResponse.events));
                setActivity((current) =>
                  eventsResponse.events.reduce(
                    (items, event) => applyActivityEvent(items, event),
                    current,
                  ),
                );
                setTaskWindow((current) => ({
                  ...current,
                  totalTaskCount: eventsResponse.events.reduce(
                    (count, event) => updateTotalTaskCount(count, event),
                    current.totalTaskCount,
                  ),
                }));
                setNotifications((current) =>
                  eventsResponse.events.reduce(
                    (items, nextEvent) =>
                      applyNotificationEvent(items, nextEvent, normalizedUserId, snapshotRef.current),
                    current,
                  ),
                );
                setError(null);
              });
            } catch (streamError) {
              if (isActive) {
                startTransition(() => {
                  setError(toErrorMessage(streamError));
                });
              }
            }
          }

          if (isActive) {
            setConnectionStatus("connected");
          }
        });

        eventSource.addEventListener("project-event", (message) => {
          if (!isActive) {
            return;
          }

          const payload = JSON.parse((message as MessageEvent<string>).data) as {
            event: ProjectEvent;
          };

          applyCommittedEvent(payload.event);
        });

        eventSource.addEventListener("presence", (message) => {
          if (!isActive) {
            return;
          }

          const payload = JSON.parse((message as MessageEvent<string>).data) as {
            viewers: PresenceViewer[];
          };

          startTransition(() => {
            setViewers(payload.viewers);
          });
        });

        eventSource.addEventListener("heartbeat", () => {
          if (isActive) {
            setConnectionStatus("connected");
          }
        });
      } catch (loadError) {
        if (isActive) {
          startTransition(() => {
            setError(toErrorMessage(loadError));
            setConnectionStatus("reconnecting");
          });
        }
      }
    };

    if (!identity.clientId) {
      return;
    }

    void connect();

    return () => {
      isActive = false;
      eventSource?.close();
    };
  }, [identity.clientId, identity.userId, projectId]);

  const loadMoreTasks = useEffectEvent(async (): Promise<void> => {
    const currentWindow = taskWindowRef.current;
    if (
      currentWindow.isLoadingMoreTasks ||
      !currentWindow.hasMoreTasks ||
      !currentWindow.nextTaskCursor
    ) {
      return;
    }

    startTransition(() => {
      setTaskWindow((windowState) => ({
        ...windowState,
        isLoadingMoreTasks: true,
      }));
      setError(null);
    });

    try {
      const response = await fetchProjectTaskPage(projectId, {
        after: currentWindow.nextTaskCursor,
        limit: TASK_PAGE_SIZE,
      });

      startTransition(() => {
        setServerSnapshot((current) =>
          current ? mergeTaskPage(current, response.page) : current,
        );
        setTaskWindow({
          hasMoreTasks: response.page.hasMore,
          isLoadingMoreTasks: false,
          nextTaskCursor: response.page.nextCursor,
          totalTaskCount: response.page.totalCount,
        });
      });
    } catch (loadMoreError) {
      startTransition(() => {
        setTaskWindow((windowState) => ({
          ...windowState,
          isLoadingMoreTasks: false,
        }));
        setError(toErrorMessage(loadMoreError));
      });
    }
  });

  const refresh = useEffectEvent(async (): Promise<void> => {
    startTransition(() => {
      setError(null);
      setConnectionStatus("loading");
    });

    try {
      await refreshSnapshot();
    } catch (refreshError) {
      startTransition(() => {
        setError(toErrorMessage(refreshError));
        setConnectionStatus("reconnecting");
      });
      throw refreshError;
    }
  });

  const updateCursor = useEffectEvent(async (cursor: PresenceCursor | null): Promise<void> => {
    const normalizedUserId = identity.userId.trim();
    if (!identity.clientId || !normalizedUserId) {
      return;
    }

    const payload = JSON.stringify(cursor ?? null);
    if (payload === lastCursorPayloadRef.current) {
      return;
    }

    lastCursorPayloadRef.current = payload;
    await updateProjectPresence(projectId, {
      clientId: identity.clientId,
      userId: normalizedUserId,
      location: "project",
      cursor,
    });
  });

  const commitDispatch = useEffectEvent(
    async (
      input: DispatchInput,
      options: DispatchOptions = {},
    ): Promise<ProjectEvent> => {
      const recordHistory = options.recordHistory ?? true;
      const clearRedoStack = options.clearRedoStack ?? recordHistory;

      if (!identity.clientId || !identity.userId.trim()) {
        throw new Error("display name is required before mutating");
      }

      if (pendingMutationRef.current) {
        throw new Error("wait for the current mutation to finish");
      }

      let baseSnapshot = snapshotRef.current;
      if (!baseSnapshot) {
        throw new Error("project snapshot has not loaded yet");
      }

      const commitInput = async (
        mutationInput: AppendEventInput,
        mutationBaseSnapshot: ProjectSnapshot,
      ): Promise<ProjectEvent> => {
        const response = await appendProjectEvent(projectId, mutationInput);
        const historyEntry =
          recordHistory ? createHistoryEntry(mutationBaseSnapshot, response.event) : null;

        startTransition(() => {
          setServerSnapshot((current) =>
            current ? applyProjectEvent(current, response.event) : current,
          );
          setActivity((current) => applyActivityEvent(current, response.event));
          setPendingMutation((current) =>
            current?.input.id === mutationInput.id ? null : current,
          );
          if (historyEntry) {
            setUndoStack((current) => trimHistory([...current, historyEntry]));
          }
          if (clearRedoStack) {
            setRedoStack([]);
          }
          setError(null);
        });

        return response.event;
      };

      const requestInput: AppendEventInput = {
        id: crypto.randomUUID(),
        projectId,
        entityId: input.entityId,
        action: input.action,
        clientId: identity.clientId,
        userId: identity.userId.trim(),
        timestamp: Date.now(),
        expectedVersion: baseSnapshot.version,
        parentVersion: input.parentVersion,
      };

      const optimisticEvent = buildOptimisticEvent(baseSnapshot, requestInput);
      startTransition(() => {
        setPendingMutation({
          input: requestInput,
          optimisticEvent,
        });
        setError(null);
      });

      try {
        return await commitInput(requestInput, baseSnapshot);
      } catch (initialError) {
        if (!isConflictError(initialError)) {
          startTransition(() => {
            setPendingMutation((current) =>
              current?.input.id === requestInput.id ? null : current,
            );
            setError(toErrorMessage(initialError));
          });
          throw initialError;
        }

        startTransition(() => {
          setPendingMutation(null);
        });

        const freshSnapshot = await refreshSnapshot();
        baseSnapshot = freshSnapshot;

        const retryInput: AppendEventInput = {
          ...requestInput,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          expectedVersion: freshSnapshot.version,
        };
        const retryOptimisticEvent = buildOptimisticEvent(freshSnapshot, retryInput);

        startTransition(() => {
          setPendingMutation({
            input: retryInput,
            optimisticEvent: retryOptimisticEvent,
          });
        });

        try {
          return await commitInput(retryInput, freshSnapshot);
        } catch (retryError) {
          startTransition(() => {
            setPendingMutation((current) =>
              current?.input.id === retryInput.id ? null : current,
            );
            setError(toErrorMessage(retryError));
          });
          throw retryError;
        }
      }
    },
  );

  const dispatch = useEffectEvent(async (input: DispatchInput): Promise<ProjectEvent> => {
    if (!identity.clientId || !identity.userId.trim()) {
      throw new Error("display name is required before mutating");
    }

    return commitDispatch(input, {
      clearRedoStack: true,
      recordHistory: true,
    });
  });

  const undo = useEffectEvent(async (): Promise<void> => {
    const entry = undoStackRef.current.at(-1);
    if (!entry) {
      return;
    }

    const event = await commitDispatch(
      {
        entityId: entry.undoAction.entityId,
        action: entry.undoAction.action,
        parentVersion: entry.targetVersion,
      },
      {
        clearRedoStack: false,
        recordHistory: false,
      },
    );

    startTransition(() => {
      setUndoStack((current) => current.slice(0, -1));
      setRedoStack((current) =>
        trimHistory([
          ...current,
          {
            ...entry,
            targetVersion: event.version,
          },
        ]),
      );
    });
  });

  const redo = useEffectEvent(async (): Promise<void> => {
    const entry = redoStackRef.current.at(-1);
    if (!entry) {
      return;
    }

    const event = await commitDispatch(
      {
        entityId: entry.redoAction.entityId,
        action: entry.redoAction.action,
        parentVersion: entry.targetVersion,
      },
      {
        clearRedoStack: false,
        recordHistory: false,
      },
    );

    startTransition(() => {
      setRedoStack((current) => current.slice(0, -1));
      setUndoStack((current) =>
        trimHistory([
          ...current,
          {
            ...entry,
            targetVersion: event.version,
          },
        ]),
      );
    });
  });

  return {
    activity,
    canRedo: redoStack.length > 0 && pendingMutation === null,
    canUndo: undoStack.length > 0 && pendingMutation === null,
    connectionStatus,
    dispatch,
    error,
    hasMoreTasks: taskWindow.hasMoreTasks,
    isMutating: pendingMutation !== null,
    isLoadingMoreTasks: taskWindow.isLoadingMoreTasks,
    loadMoreTasks,
    notifications,
    refresh,
    redo,
    snapshot:
      serverSnapshot && pendingMutation
        ? deriveVisibleSnapshot(serverSnapshot, pendingMutation.optimisticEvent)
        : serverSnapshot,
    totalTaskCount: taskWindow.totalTaskCount,
    undo,
    updateCursor,
    viewers,
  };
}
