import { NextResponse } from "next/server";

import { projectTaskPageResponseSchema } from "../../../../../src/shared/api";
import { handleRouteError } from "../../../../../src/server/api/errors";
import {
  readCursorQuery,
  readLimitQuery,
} from "../../../../../src/server/api/requests";
import {
  DEFAULT_TASK_PAGE_SIZE,
  getTaskPage,
} from "../../../../../src/server/events/snapshot";

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
    const after = readCursorQuery(request);
    const limit = readLimitQuery(request, {
      defaultValue: DEFAULT_TASK_PAGE_SIZE,
    });
    const page = await getTaskPage(projectId, {
      after,
      taskLimit: limit,
    });

    return NextResponse.json(projectTaskPageResponseSchema.parse({ page }));
  } catch (error) {
    return handleRouteError(error);
  }
}
