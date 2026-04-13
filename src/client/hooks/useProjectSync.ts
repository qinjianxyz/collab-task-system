"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { type ApiError, appendProjectEvent, fetchProjectEvents, fetchProjectSnapshot } from "../api";
import { applyActivityEvent, buildActivityFeed, type ActivityItem } from "../sync/activity";
import { createHistoryEntry, type HistoryEntry } from "../sync/history";
import { buildOptimisticEvent, deriveVisibleSnapshot, applyProjectEvent } from "../sync/reducer";
import type {
  AppendEventInput,
  EventAction,
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
  isMutating: boolean;
  redo: () => Promise<void>;
  snapshot: ProjectSnapshot | null;
  undo: () => Promise<void>;
  viewers: PresenceViewer[];
};

type DispatchOptions = {
  clearRedoStack?: boolean;
  recordHistory?: boolean;
};

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

export function useProjectSync(
  projectId: string,
  identity: Identity,
): UseProjectSyncResult {
  const [serverSnapshot, setServerSnapshot] = useState<ProjectSnapshot | null>(null);
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const snapshotRef = useRef<ProjectSnapshot | null>(null);
  const pendingMutationRef = useRef<PendingMutation | null>(null);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const lastVersionRef = useRef(0);

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

  const applyCommittedEvent = useEffectEvent((event: ProjectEvent) => {
    startTransition(() => {
      setServerSnapshot((current) => (current ? applyProjectEvent(current, event) : current));
      setActivity((current) => applyActivityEvent(current, event));
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

    startTransition(() => {
      setServerSnapshot(response.snapshot);
      setPendingMutation(null);
      setActivity(buildActivityFeed(recentEventsResponse.events));
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
        const snapshot = await refreshSnapshot();
        if (!isActive) {
          return;
        }

        lastVersionRef.current = snapshot.version;

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

      const expectedEntityVersion = (() => {
        switch (input.action.type) {
          case "task.create":
          case "comment.create":
            return 0;
          case "task.update":
          case "task.delete": {
            const task = baseSnapshot.tasks.find((t) => t.id === input.entityId);
            return task?.entityVersion;
          }
          case "comment.update":
          case "comment.delete": {
            const comment = baseSnapshot.comments.find((c) => c.id === input.entityId);
            return comment?.entityVersion;
          }
          default:
            return undefined;
        }
      })();

      const requestInput: AppendEventInput = {
        id: crypto.randomUUID(),
        projectId,
        entityId: input.entityId,
        action: input.action,
        clientId: identity.clientId,
        userId: identity.userId.trim(),
        timestamp: Date.now(),
        expectedVersion: baseSnapshot.version,
        expectedEntityVersion,
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

        const retryExpectedEntityVersion = (() => {
          switch (input.action.type) {
            case "task.create":
            case "comment.create":
              return 0;
            case "task.update":
            case "task.delete": {
              const task = freshSnapshot.tasks.find((t) => t.id === input.entityId);
              return task?.entityVersion;
            }
            case "comment.update":
            case "comment.delete": {
              const comment = freshSnapshot.comments.find((c) => c.id === input.entityId);
              return comment?.entityVersion;
            }
            default:
              return undefined;
          }
        })();

        const retryInput: AppendEventInput = {
          ...requestInput,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          expectedVersion: freshSnapshot.version,
          expectedEntityVersion: retryExpectedEntityVersion,
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
    isMutating: pendingMutation !== null,
    redo,
    snapshot:
      serverSnapshot && pendingMutation
        ? deriveVisibleSnapshot(serverSnapshot, pendingMutation.optimisticEvent)
        : serverSnapshot,
    undo,
    viewers,
  };
}
