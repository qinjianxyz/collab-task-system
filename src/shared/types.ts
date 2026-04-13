import { z } from "zod";

export const taskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "done",
  "blocked",
  "canceled",
]);

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const taskConfigSchema = z.object({
  priority: taskPrioritySchema.optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.string(), z.unknown()).default({}),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  currentVersion: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const taskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  status: taskStatusSchema,
  assignedTo: z.array(z.string()).default([]),
  configuration: taskConfigSchema.default({
    tags: [],
    customFields: {},
  }),
  dependencies: z.array(z.string()).default([]),
  position: z.number(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  entityVersion: z.number().int().positive().optional(),
});

export const commentSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  content: z.string().min(1),
  author: z.string().min(1),
  mentions: z.array(z.string()).default([]),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  entityVersion: z.number().int().positive().optional(),
});

export const presenceViewerSchema = z.object({
  clientId: z.string().min(1),
  userId: z.string().min(1),
  location: z.string().min(1),
  connectedAt: z.number().int().nonnegative(),
});

const projectCreateActionSchema = z.object({
  type: z.literal("project.create"),
  data: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

const projectUpdateActionSchema = z.object({
  type: z.literal("project.update"),
  data: z
    .object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "project.update requires at least one field",
    }),
});

const taskCreateActionSchema = z.object({
  type: z.literal("task.create"),
  data: z.object({
    title: z.string().min(1),
    status: taskStatusSchema,
    projectId: z.string().min(1),
    assignedTo: z.array(z.string()).optional(),
    configuration: taskConfigSchema.optional(),
    dependencies: z.array(z.string()).optional(),
    position: z.number().optional(),
  }),
});

const taskUpdateActionSchema = z.object({
  type: z.literal("task.update"),
  data: z
    .object({
      title: z.string().min(1).optional(),
      status: taskStatusSchema.optional(),
      assignedTo: z.array(z.string()).optional(),
      configuration: taskConfigSchema.optional(),
      dependencies: z.array(z.string()).optional(),
      position: z.number().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "task.update requires at least one field",
    }),
});

const taskDeleteActionSchema = z.object({
  type: z.literal("task.delete"),
  data: z.object({}),
});

const commentCreateActionSchema = z.object({
  type: z.literal("comment.create"),
  data: z.object({
    taskId: z.string().min(1),
    content: z.string().min(1),
    author: z.string().min(1),
  }),
});

const commentUpdateActionSchema = z.object({
  type: z.literal("comment.update"),
  data: z.object({
    content: z.string().min(1),
  }),
});

const commentDeleteActionSchema = z.object({
  type: z.literal("comment.delete"),
  data: z.object({}),
});

const presenceUpdateActionSchema = z.object({
  type: z.literal("presence.update"),
  data: z.object({
    userId: z.string().min(1),
    location: z.string().min(1),
    cursor: z.unknown().optional(),
  }),
});

export const eventActionSchema = z.discriminatedUnion("type", [
  projectCreateActionSchema,
  projectUpdateActionSchema,
  taskCreateActionSchema,
  taskUpdateActionSchema,
  taskDeleteActionSchema,
  commentCreateActionSchema,
  commentUpdateActionSchema,
  commentDeleteActionSchema,
  presenceUpdateActionSchema,
]);

const eventEnvelopeSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  entityId: z.string().min(1),
  action: eventActionSchema,
  clientId: z.string().min(1),
  userId: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  parentVersion: z.number().int().nonnegative().optional(),
});

export const projectEventSchema = eventEnvelopeSchema.extend({
  version: z.number().int().positive(),
  entityVersion: z.number().int().positive().optional(),
});

export const appendEventInputSchema = eventEnvelopeSchema.extend({
  expectedVersion: z.number().int().nonnegative(),
  expectedEntityVersion: z.number().int().nonnegative().optional(),
});

export const projectSnapshotSchema = z.object({
  project: projectSchema,
  tasks: z.array(taskSchema),
  comments: z.array(commentSchema),
  version: z.number().int().nonnegative(),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskConfig = z.infer<typeof taskConfigSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type PresenceViewer = z.infer<typeof presenceViewerSchema>;
export type EventAction = z.infer<typeof eventActionSchema>;
export type ProjectEvent = z.infer<typeof projectEventSchema>;
export type AppendEventInput = z.infer<typeof appendEventInputSchema>;
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;
