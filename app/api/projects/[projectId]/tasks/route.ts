import { NextResponse } from "next/server";

import { projectTaskPageResponseSchema } from "../../../../../src/shared/api";
import { handleRouteError } from "../../../../../src/server/api/errors";
import { BadRequestError } from "../../../../../src/server/api/errors";
import { getProjectTaskPage } from "../../../../../src/server/projects/task-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

function readTaskPageQuery(request: Request): { after: string | null; limit: number | undefined } {
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const limitParam = url.searchParams.get("limit");

  if (limitParam === null || limitParam.length === 0) {
    return {
      after,
      limit: undefined,
    };
  }

  const limit = Number(limitParam);
  if (!Number.isInteger(limit)) {
    throw new BadRequestError("limit must be an integer between 1 and 200");
  }

  return {
    after,
    limit,
  };
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { projectId } = await context.params;
    const query = readTaskPageQuery(request);
    const page = await getProjectTaskPage(projectId, query);

    return NextResponse.json(projectTaskPageResponseSchema.parse({ page }));
  } catch (error) {
    return handleRouteError(error);
  }
}
