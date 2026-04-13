import { NextResponse } from "next/server";

import { projectNotificationsResponseSchema } from "../../../../../src/shared/api";
import { BadRequestError, handleRouteError } from "../../../../../src/server/api/errors";
import { ensureProjectExists } from "../../../../../src/server/events/event-store";
import { listProjectNotifications } from "../../../../../src/server/notifications/store";

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
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId")?.trim() ?? "";

    if (!userId) {
      throw new BadRequestError("userId is required");
    }

    await ensureProjectExists(projectId);
    const notifications = await listProjectNotifications(projectId, userId);

    return NextResponse.json(
      projectNotificationsResponseSchema.parse({ notifications }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
