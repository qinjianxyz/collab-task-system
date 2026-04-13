import { NextResponse } from "next/server";

import {
  createProjectRequestSchema,
  createProjectResponseSchema,
} from "../../../src/shared/api";
import { appendEvent } from "../../../src/server/events/event-store";
import { handleRouteError } from "../../../src/server/api/errors";
import { readJsonBody } from "../../../src/server/api/requests";
import { publishProjectEvent } from "../../../src/server/realtime/project-stream";
import {
  getWriteRateLimiter,
  RateLimitError,
} from "../../../src/server/realtime/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonBody(request, createProjectRequestSchema);
    const limit = await getWriteRateLimiter().check(
      `project-create:${body.userId}:${body.clientId}`,
    );

    if (!limit.allowed) {
      throw new RateLimitError(
        "too many project create requests; retry later",
        limit.retryAfterMs,
      );
    }

    const projectId = crypto.randomUUID();
    const event = await appendEvent({
      id: crypto.randomUUID(),
      projectId,
      entityId: projectId,
      action: {
        type: "project.create",
        data: {
          name: body.name,
          description: body.description,
          metadata: body.metadata,
        },
      },
      clientId: body.clientId,
      userId: body.userId,
      timestamp: Date.now(),
      expectedVersion: 0,
    });

    publishProjectEvent(event);

    return NextResponse.json(
      createProjectResponseSchema.parse({
        projectId,
        event,
      }),
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
