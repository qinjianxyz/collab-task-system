import { z } from "zod";

import {
  appendEventInputSchema,
  commentSchema,
  mentionNotificationSchema,
  presenceCursorSchema,
  presenceViewerSchema,
  projectEventSchema,
  projectSnapshotSchema,
  taskSchema,
} from "./types";

export const taskCursorSchema = z.string().min(1);

export const projectTaskPageSchema = z.object({
  tasks: z.array(taskSchema),
  comments: z.array(commentSchema),
  nextCursor: taskCursorSchema.nullable(),
  hasMore: z.boolean(),
  totalCount: z.number().int().nonnegative(),
});

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
  page: projectTaskPageSchema.optional(),
});

export const projectEventsResponseSchema = z.object({
  events: z.array(projectEventSchema),
});

export const projectTaskPageResponseSchema = z.object({
  page: projectTaskPageSchema,
});

export const projectNotificationsResponseSchema = z.object({
  notifications: z.array(mentionNotificationSchema),
});

export const presenceUpdateRequestSchema = z.object({
  clientId: z.string().min(1),
  userId: z.string().min(1),
  location: z.string().min(1),
  cursor: presenceCursorSchema.nullable().optional(),
});

export const presenceUpdateResponseSchema = z.object({
  viewers: z.array(presenceViewerSchema),
});

export const taskDescriptionStateResponseSchema = z.object({
  state: z.string().min(1),
});

export const taskDescriptionSyncRequestSchema = z.object({
  clientId: z.string().min(1),
  update: z.string().min(1),
});

export const taskDescriptionSyncResponseSchema = z.object({
  ok: z.literal(true),
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
export type ProjectEventsResponse = z.infer<typeof projectEventsResponseSchema>;
export type ProjectTaskPageResponse = z.infer<typeof projectTaskPageResponseSchema>;
export type ProjectNotificationsResponse = z.infer<typeof projectNotificationsResponseSchema>;
export type PresenceUpdateRequest = z.infer<typeof presenceUpdateRequestSchema>;
export type PresenceUpdateResponse = z.infer<typeof presenceUpdateResponseSchema>;
export type TaskDescriptionStateResponse = z.infer<typeof taskDescriptionStateResponseSchema>;
export type TaskDescriptionSyncRequest = z.infer<typeof taskDescriptionSyncRequestSchema>;
export type TaskDescriptionSyncResponse = z.infer<typeof taskDescriptionSyncResponseSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
