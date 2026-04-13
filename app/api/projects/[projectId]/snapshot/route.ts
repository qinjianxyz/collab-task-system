import { NextResponse } from "next/server";

import { projectSnapshotResponseSchema } from "../../../../../src/shared/api";
import { handleRouteError } from "../../../../../src/server/api/errors";
import { getWorkspaceBootstrap } from "../../../../../src/server/projects/workspace-bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TASK_LIMIT = 100;
const MAX_TASK_LIMIT = 200;

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
    const rawLimit = url.searchParams.get("taskLimit");
    const taskLimit = rawLimit
      ? Math.min(Math.max(1, Number(rawLimit)), MAX_TASK_LIMIT)
      : DEFAULT_TASK_LIMIT;

    const { snapshot, initialTaskPage } = await getWorkspaceBootstrap(projectId, taskLimit);

    return NextResponse.json(
      projectSnapshotResponseSchema.parse({
        snapshot,
        page: initialTaskPage,
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
