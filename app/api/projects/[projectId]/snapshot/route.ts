import { NextResponse } from "next/server";

import { projectSnapshotResponseSchema } from "../../../../../src/shared/api";
import { handleRouteError } from "../../../../../src/server/api/errors";
import { getSnapshot } from "../../../../../src/server/events/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { projectId } = await context.params;
    const snapshot = await getSnapshot(projectId);

    return NextResponse.json(projectSnapshotResponseSchema.parse({ snapshot }));
  } catch (error) {
    return handleRouteError(error);
  }
}
