create table if not exists notifications (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  task_id text not null references tasks(id) on delete cascade,
  task_title text not null,
  comment_id text not null,
  user_id text not null,
  actor_user_id text not null,
  content_preview text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_project_comment_user_unique_idx unique (project_id, comment_id, user_id)
);

create index if not exists notifications_project_user_updated_at_idx
  on notifications (project_id, user_id, updated_at desc);
