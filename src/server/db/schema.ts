import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  currentVersion: integer("current_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull(),
    assignedTo: text("assigned_to").array().notNull().default([]),
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    dependencies: text("dependencies").array().notNull().default([]),
    position: doublePrecision("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectPositionIndex: index("tasks_project_position_idx").on(
      table.projectId,
      table.position,
    ),
    projectStatusPositionIndex: index("tasks_project_status_position_idx").on(
      table.projectId,
      table.status,
      table.position,
    ),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    author: text("author").notNull(),
    mentions: text("mentions").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskCreatedAtIndex: index("comments_task_created_at_idx").on(
      table.taskId,
      table.createdAt,
    ),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    taskTitle: text("task_title").notNull(),
    commentId: text("comment_id").notNull(),
    userId: text("user_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    contentPreview: text("content_preview").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectUserUpdatedAtIndex: index("notifications_project_user_updated_at_idx").on(
      table.projectId,
      table.userId,
      table.updatedAt,
    ),
    commentUserUniqueIndex: uniqueIndex("notifications_project_comment_user_unique_idx").on(
      table.projectId,
      table.commentId,
      table.userId,
    ),
  }),
);

export const events = pgTable(
  "events",
  {
    id: text("id").notNull(),
    projectId: text("project_id").notNull(),
    entityId: text("entity_id").notNull(),
    actionType: text("action_type").notNull(),
    actionData: jsonb("action_data").$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull(),
    clientId: text("client_id").notNull(),
    userId: text("user_id").notNull(),
    timestampMs: bigint("timestamp_ms", { mode: "number" }).notNull(),
    parentVersion: integer("parent_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventIdUniqueIndex: uniqueIndex("events_project_id_id_unique_idx").on(
      table.projectId,
      table.id,
    ),
    projectEntityVersionIndex: index("events_project_entity_version_idx").on(
      table.projectId,
      table.entityId,
      table.version,
    ),
    projectVersionIndex: index("events_project_version_desc_idx").on(
      table.projectId,
      table.version,
    ),
  }),
);
