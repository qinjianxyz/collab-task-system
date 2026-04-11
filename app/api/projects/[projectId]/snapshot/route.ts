import { NextResponse } from "next/server";

import {
  loadedProjectSnapshotResponseSchema,
  pagedProjectSnapshotResponseSchema,
  projectSnapshotResponseSchema,
} from "../../../../../src/shared/api";
import { handleRouteError } from "../../../../../src/server/api/errors";
import { readLimitQuery } from "../../../../../src/server/api/requests";
import {
  DEFAULT_TASK_PAGE_SIZE,
  getPagedSnapshot,
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
    const taskLimit = readLimitQuery(request, {
      defaultValue: DEFAULT_TASK_PAGE_SIZE,
      paramName: "taskLimit",
    });
    const snapshot = await getPagedSnapshot(projectId, {
      taskLimit,
    });
    const compatibilitySnapshot = {
      ...snapshot,
      tasks: snapshot.taskPage.tasks,
      comments: snapshot.taskPage.comments,
    };

    projectSnapshotResponseSchema.parse({
      snapshot: compatibilitySnapshot,
    });
    loadedProjectSnapshotResponseSchema.parse({
      snapshot: compatibilitySnapshot,
    });
    pagedProjectSnapshotResponseSchema.parse({
      snapshot,
    });

    return NextResponse.json({
      snapshot: compatibilitySnapshot,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
