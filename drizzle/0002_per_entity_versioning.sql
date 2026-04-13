-- Add entity_version to tasks table
alter table tasks
  add column if not exists entity_version integer not null default 1;

-- Add entity_version to comments table
alter table comments
  add column if not exists entity_version integer not null default 1;

-- Add entity_version to events table (nullable — legacy events have no per-entity version)
alter table events
  add column if not exists entity_version integer;

-- Composite index for per-entity version lookups on tasks
create index if not exists tasks_id_entity_version_idx
  on tasks (id, entity_version);

-- Composite index for per-entity version lookups on comments
create index if not exists comments_id_entity_version_idx
  on comments (id, entity_version);
