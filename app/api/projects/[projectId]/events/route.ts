import { NextResponse } from "next/server";

import {
  appendProjectEventRequestSchema,
  appendProjectEventResponseSchema,
  projectEventsResponseSchema,
} from "../../../../../src/shared/api";
import { handleRouteError } from "../../../../../src/server/api/errors";
import { readJsonBody, readSinceQuery } from "../../../../../src/server/api/requests";
import {
  appendEvent,
  getEventsSince,
} from "../../../../../src/server/events/event-store";
import { publishProjectEvent } from "../../../../../src/server/realtime/project-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { projectId } = await context.params;
    const since = readSinceQuery(request);
    const events = await getEventsSince(projectId, since);

    return NextResponse.json(projectEventsResponseSchema.parse({ events }));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { projectId } = await context.params;
    const body = await readJsonBody(request, appendProjectEventRequestSchema);
    const event = await appendEvent({
      ...body,
      projectId,
    });

    publishProjectEvent(event);

    return NextResponse.json(
      appendProjectEventResponseSchema.parse({ event }),
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
