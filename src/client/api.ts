import {
  apiErrorResponseSchema,
  appendProjectEventRequestSchema,
  appendProjectEventResponseSchema,
  createProjectRequestSchema,
  createProjectResponseSchema,
  projectEventsResponseSchema,
  projectSnapshotResponseSchema,
  type AppendProjectEventRequest,
  type CreateProjectRequest,
  type CreateProjectResponse,
  type ProjectEventsResponse,
  type ProjectSnapshotResponse,
} from "../shared/api";
import type { AppendEventInput } from "../shared/types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseResponse<T>(
  response: Response,
  schema: { parse: (input: unknown) => T },
): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload = apiErrorResponseSchema.safeParse(payload);
    if (errorPayload.success) {
      throw new ApiError(
        response.status,
        errorPayload.data.error.code,
        errorPayload.data.error.message,
      );
    }

    throw new ApiError(response.status, "unknown_error", response.statusText);
  }

  return schema.parse(payload);
}

export async function createProject(
  input: CreateProjectRequest,
): Promise<CreateProjectResponse> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(createProjectRequestSchema.parse(input)),
  });

  return parseResponse(response, createProjectResponseSchema);
}

export async function fetchProjectSnapshot(
  projectId: string,
): Promise<ProjectSnapshotResponse> {
  const response = await fetch(`/api/projects/${projectId}/snapshot`, {
    cache: "no-store",
  });

  return parseResponse(response, projectSnapshotResponseSchema);
}

export async function fetchProjectEvents(
  projectId: string,
  since: number,
): Promise<ProjectEventsResponse> {
  const response = await fetch(`/api/projects/${projectId}/events?since=${since}`, {
    cache: "no-store",
  });

  return parseResponse(response, projectEventsResponseSchema);
}

export async function appendProjectEvent(
  projectId: string,
  input: AppendEventInput,
): Promise<{ event: Awaited<ReturnType<typeof appendProjectEventResponseSchema.parse>>["event"] }> {
  const body: AppendProjectEventRequest = appendProjectEventRequestSchema.parse({
    id: input.id,
    entityId: input.entityId,
    action: input.action,
    clientId: input.clientId,
    userId: input.userId,
    timestamp: input.timestamp,
    expectedVersion: input.expectedVersion,
    parentVersion: input.parentVersion,
  });

  const response = await fetch(`/api/projects/${projectId}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseResponse(response, appendProjectEventResponseSchema);
}
