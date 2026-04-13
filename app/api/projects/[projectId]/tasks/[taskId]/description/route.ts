import { NextResponse } from "next/server";

import {
  taskDescriptionStateResponseSchema,
  taskDescriptionSyncRequestSchema,
  taskDescriptionSyncResponseSchema,
} from "../../../../../../../src/shared/api";
import { handleRouteError } from "../../../../../../../src/server/api/errors";
import { readJsonBody } from "../../../../../../../src/server/api/requests";
import {
  getPersistedTaskDescription,
  getTaskDescriptionStore,
} from "../../../../../../../src/server/realtime/task-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    projectId: string;
    taskId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { projectId, taskId } = await context.params;
    const initialText = await getPersistedTaskDescription(projectId, taskId);
    const state = getTaskDescriptionStore().getDocumentState(projectId, taskId, initialText);

    return NextResponse.json(taskDescriptionStateResponseSchema.parse({ state }));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { projectId, taskId } = await context.params;
    const body = await readJsonBody(request, taskDescriptionSyncRequestSchema);
    const initialText = await getPersistedTaskDescription(projectId, taskId);

    getTaskDescriptionStore().applyClientUpdate(
      projectId,
      taskId,
      body.update,
      initialText,
      body.clientId,
    );

    return NextResponse.json(taskDescriptionSyncResponseSchema.parse({ ok: true }));
  } catch (error) {
    return handleRouteError(error);
  }
}
