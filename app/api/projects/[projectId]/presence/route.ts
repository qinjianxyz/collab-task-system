import { NextResponse } from "next/server";

import {
  presenceUpdateRequestSchema,
  presenceUpdateResponseSchema,
} from "../../../../../src/shared/api";
import { handleRouteError } from "../../../../../src/server/api/errors";
import { readJsonBody } from "../../../../../src/server/api/requests";
import { ensureProjectExists } from "../../../../../src/server/events/event-store";
import { getPresenceStore } from "../../../../../src/server/realtime/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { projectId } = await context.params;
    const body = await readJsonBody(request, presenceUpdateRequestSchema);
    await ensureProjectExists(projectId);

    const presenceStore = getPresenceStore();
    presenceStore.upsertViewer(projectId, {
      clientId: body.clientId,
      userId: body.userId,
      location: body.location,
      connectedAt: Date.now(),
      ...(body.cursor ? { cursor: body.cursor } : {}),
    });

    return NextResponse.json(
      presenceUpdateResponseSchema.parse({
        viewers: presenceStore.getViewers(projectId),
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
