import type { NextResponse } from "next/server";

import { getProjectVersion } from "../../../../../src/server/events/event-store";
import { subscribeToProjectEvents } from "../../../../../src/server/realtime/project-stream";
import { getPresenceStore } from "../../../../../src/server/realtime/presence";
import { StreamBuffer } from "../../../../../src/server/realtime/stream-buffer";
import type { PresenceViewer } from "../../../../../src/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

function encodeSse(eventName: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response | NextResponse> {
  const { projectId } = await context.params;
  const version = await getProjectVersion(projectId);
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId")?.trim() ?? "";
  const userId = url.searchParams.get("userId")?.trim() ?? "";
  const location = url.searchParams.get("location")?.trim() || "project";
  const viewer: PresenceViewer | null =
    clientId && userId
      ? {
          clientId,
          userId,
          location,
          connectedAt: Date.now(),
        }
      : null;
  const presenceStore = viewer ? getPresenceStore() : null;

  let unsubscribe: () => void = () => undefined;
  let unsubscribePresence: () => void = () => undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let isClosed = false;
  let streamBuffer: StreamBuffer<Uint8Array> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (isClosed) {
          return;
        }

        isClosed = true;

        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = undefined;
        }

        streamBuffer?.close();
        streamBuffer = undefined;

        unsubscribe();
        unsubscribe = () => undefined;
        unsubscribePresence();
        unsubscribePresence = () => undefined;

        if (viewer && presenceStore) {
          presenceStore.scheduleRemoval(projectId, viewer.clientId);
        }

        try {
          controller.close();
        } catch {
          // stream already closed
        }
      };

      const enqueue = (eventName: string, data: unknown) => {
        if (isClosed) {
          return;
        }

        streamBuffer?.push(encodeSse(eventName, data));
      };

      streamBuffer = new StreamBuffer<Uint8Array>({
        maxSize: Number(process.env.SSE_BUFFER_LIMIT ?? "64"),
        onOverflow: close,
        onWrite: (chunk) => {
          if (isClosed) {
            return true;
          }

          const desiredSize = controller.desiredSize;
          if (desiredSize !== null && desiredSize <= 0) {
            return false;
          }

          try {
            controller.enqueue(chunk);
            return true;
          } catch {
            close();
            return true;
          }
        },
      });

      const initialize = async () => {
        enqueue("version", { version });

        unsubscribe = subscribeToProjectEvents(projectId, (event) => {
          enqueue("project-event", { event });
        });

        if (viewer && presenceStore) {
          await presenceStore.upsertViewer(projectId, viewer);
          enqueue("presence", {
            viewers: await presenceStore.getViewers(projectId),
          });
          unsubscribePresence = presenceStore.subscribe(projectId, (viewers) => {
            enqueue("presence", { viewers });
          });
        }

        heartbeat = setInterval(() => {
          enqueue("heartbeat", { ts: Date.now() });
        }, 15_000);
      };

      void initialize();

      request.signal.addEventListener(
        "abort",
        () => {
          close();
        },
        { once: true },
      );
    },
    cancel() {
      isClosed = true;

      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = undefined;
      }

      streamBuffer?.close();
      streamBuffer = undefined;

      unsubscribe();
      unsubscribe = () => undefined;
      unsubscribePresence();
      unsubscribePresence = () => undefined;

      if (viewer && presenceStore) {
        presenceStore.scheduleRemoval(projectId, viewer.clientId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
}
