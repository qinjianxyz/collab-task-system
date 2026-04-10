create table if not exists projects (
  id text primary key,
  name text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  current_version integer not null default 0 check (current_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  status text not null,
  assigned_to text[] not null default '{}'::text[],
  configuration jsonb not null default '{}'::jsonb,
  dependencies text[] not null default '{}'::text[],
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_project_position_idx
  on tasks (project_id, position);

create index if not exists tasks_project_status_position_idx
  on tasks (project_id, status, position);

create table if not exists comments (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  content text not null,
  author text not null,
  mentions text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_task_created_at_idx
  on comments (task_id, created_at);

create table if not exists events (
  id text not null,
  project_id text not null,
  entity_id text not null,
  action_type text not null,
  action_data jsonb not null,
  version integer not null check (version >= 1),
  client_id text not null,
  user_id text not null,
  timestamp_ms bigint not null check (timestamp_ms >= 0),
  parent_version integer,
  created_at timestamptz not null default now(),
  primary key (project_id, version),
  constraint events_project_id_id_unique_idx unique (project_id, id)
) partition by hash (project_id);

create table if not exists events_p0 partition of events
  for values with (modulus 8, remainder 0);
create table if not exists events_p1 partition of events
  for values with (modulus 8, remainder 1);
create table if not exists events_p2 partition of events
  for values with (modulus 8, remainder 2);
create table if not exists events_p3 partition of events
  for values with (modulus 8, remainder 3);
create table if not exists events_p4 partition of events
  for values with (modulus 8, remainder 4);
create table if not exists events_p5 partition of events
  for values with (modulus 8, remainder 5);
create table if not exists events_p6 partition of events
  for values with (modulus 8, remainder 6);
create table if not exists events_p7 partition of events
  for values with (modulus 8, remainder 7);

create index if not exists events_project_version_desc_idx
  on events (project_id, version desc);

create index if not exists events_project_entity_version_idx
  on events (project_id, entity_id, version desc);
