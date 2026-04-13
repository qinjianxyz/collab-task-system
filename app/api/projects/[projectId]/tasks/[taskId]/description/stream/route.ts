import type { NextResponse } from "next/server";

import { handleRouteError } from "../../../../../../../../src/server/api/errors";
import {
  getPersistedTaskDescription,
  getTaskDescriptionStore,
} from "../../../../../../../../src/server/realtime/task-docs";
import { createSseBuffer } from "../../../../../../../../src/server/realtime/sse-buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    projectId: string;
    taskId: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response | NextResponse> {
  try {
    const { projectId, taskId } = await context.params;
    await getPersistedTaskDescription(projectId, taskId);
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId")?.trim() ?? "";

    let unsubscribe: () => void = () => undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let isClosed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let close = () => undefined;
        const sse = createSseBuffer({
          controller,
          onOverflow: () => {
            close();
          },
        });

        close = () => {
          if (isClosed) {
            return;
          }

          isClosed = true;
          if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = undefined;
          }

          unsubscribe();
          unsubscribe = () => undefined;

          sse.close();
        };

        const enqueue = (eventName: string, data: unknown) => {
          if (isClosed) {
            return;
          }

          sse.enqueue(eventName, data);
        };

        unsubscribe = getTaskDescriptionStore().subscribe(
          projectId,
          taskId,
          (payload) => {
            if (payload.clientId && payload.clientId === clientId) {
              return;
            }

            enqueue("description-update", payload);
          },
        );

        heartbeat = setInterval(() => {
          enqueue("heartbeat", { ts: Date.now() });
        }, 15_000);

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
        unsubscribe();
        unsubscribe = () => undefined;
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
