import { z } from "zod";

import {
  appendEventInputSchema,
  pagedProjectSnapshotSchema,
  projectEventSchema,
  projectSnapshotSchema,
  projectTaskPageSchema,
} from "./types";

export const createProjectRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  clientId: z.string().min(1),
  userId: z.string().min(1),
});

export const createProjectResponseSchema = z.object({
  projectId: z.string().min(1),
  event: projectEventSchema,
});

export const appendProjectEventRequestSchema = appendEventInputSchema.omit({
  projectId: true,
});

export const appendProjectEventResponseSchema = z.object({
  event: projectEventSchema,
});

export const projectSnapshotResponseSchema = z.object({
  snapshot: projectSnapshotSchema,
});

export const pagedProjectSnapshotResponseSchema = z.object({
  snapshot: pagedProjectSnapshotSchema,
});

export const projectTaskPageResponseSchema = z.object({
  page: projectTaskPageSchema,
});

export const projectEventsResponseSchema = z.object({
  events: z.array(projectEventSchema),
});

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;
export type AppendProjectEventRequest = z.infer<
  typeof appendProjectEventRequestSchema
>;
export type AppendProjectEventResponse = z.infer<
  typeof appendProjectEventResponseSchema
>;
export type ProjectSnapshotResponse = z.infer<typeof projectSnapshotResponseSchema>;
export type PagedProjectSnapshotResponse = z.infer<
  typeof pagedProjectSnapshotResponseSchema
>;
export type ProjectTaskPageResponse = z.infer<typeof projectTaskPageResponseSchema>;
export type ProjectEventsResponse = z.infer<typeof projectEventsResponseSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
