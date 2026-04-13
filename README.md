# Collab Task System

Real-time collaborative task management built on event sourcing.

Two browser contexts. Sub-second sync. No Firebase, Supabase, or managed realtime database.

> **Demo video:** [Watch the walkthrough](https://github.com/qinjianxyz/collab-task-system/releases/download/v1.0.0-demo/task-collab-submission.mov) — live two-tab collaboration, dependency validation, presence, undo/redo, kanban view, and the architectural reasoning behind event sourcing and per-entity versioning.

## What You Can Do

- create and reopen multiple projects from the landing page
- create, update, and delete tasks
- add prerequisites with explicit `Blocked by` semantics
- enforce dependency rules and blocked status transitions on the server
- create, edit, and delete comments in real time
- watch two browser contexts converge over SSE
- see live cursor badges when another collaborator is commenting or editing a task
- edit task descriptions collaboratively with a Yjs-backed shared document
- receive `@mentions` as a durable notification projection
- use undo and redo through inverted events
- see presence and a live activity feed
- switch from detailed list view to a drag-and-drop Kanban board
- open a large benchmark project that loads tasks in paged windows and renders them through a virtualized list

## Quick Start

```bash
docker compose up --build
```

Open `http://localhost:3000`.

If `3000` is busy:

```bash
APP_PORT=8100 docker compose up --build
```

Then open `http://localhost:8100`.

## Seed The Demo Projects

The repository ships two seeds because the product walkthrough and the scale walkthrough are different stories.

```bash
# realistic evaluator walkthrough
APP_PORT=8100 bun run seed:demo

# synthetic scale benchmark
APP_PORT=8100 TASK_COUNT=300 bun run seed:scale

# heavier benchmark for the 10,000+ task challenge
APP_PORT=8100 TASK_COUNT=10000 bun run seed:scale

# OSS-reference-grade stress proof
APP_PORT=8100 TASK_COUNT=30000 bun run seed:scale
```

Each command prints JSON with a `url`. Use:

- the realistic URL for collaboration and domain behavior
- the scale URL for paged reads and virtualized rendering

## What The Evaluator Should See

### Realistic Project

Use the `Ship Collab Task System` seed to show:

- believable task names, owners, comments, and blockers
- two-context sync
- blocked transition errors with concrete dependency names
- comment create/edit/delete
- collaborative description editing
- mention notifications
- live cursor badges on active tasks
- task delete
- undo/redo
- presence and activity
- board view with drag-and-drop reorder

### Scale Project

Use the large synthetic seed to show:

- the first project render only loads a task window, not the entire long list
- follow-up task windows are fetched by cursor from `/api/projects/{projectId}/tasks`
- the DOM only renders the visible task window instead of every loaded row at once
- the same task model can switch into Kanban without changing the write path

## Architecture At A Glance

```text
Client
  | optimistic local apply
  | POST append command
  v
Next.js route handler
  | parse + validate + expectedVersion check
  v
append-only event log + projection tables
  | same SQL transaction
  v
committed project version
  | publish committed event
  v
SSE stream
  v
all connected clients
```

This is the core claim of the project:

- the event log is the source of truth
- the current UI state is a projection
- realtime collaboration is a projection
- undo/redo is a projection
- the activity feed is a projection
- mention notifications are a projection

Ephemeral collaboration uses the same project transport shape without polluting the durable log:

- presence viewers and live cursors are ephemeral SSE state
- collaborative descriptions use a task-scoped Yjs document with durable checkpoints back through `task.update`

## Why Event Sourcing Instead Of CRUD

| Concern | CRUD-first design | Collab Task System |
| --- | --- | --- |
| Realtime sync | add sockets or polling around mutable rows | stream committed events |
| Conflict handling | ad hoc merge or last-write-wins | optimistic concurrency via `expectedVersion` |
| Undo/redo | separate history subsystem | invert the original event |
| Activity feed | separate audit trail | projection over the same stream |
| Large payloads | resend or diff large documents | ship small ordered changes and paged reads |

This is not a CRUD app with realtime bolted on. The architecture starts from the event stream, and the collaboration features fall out of that decision instead of being layered on later.

## Sync Flow

1. Server-render the first task window for the project.
2. Open the SSE stream for committed versions, events, and presence.
3. Apply local writes optimistically.
4. POST the append command with `expectedVersion`.
5. Commit the event and projection update in the same SQL transaction.
6. Broadcast the committed event.
7. On `409`, refresh state and retry once against the latest version.

## How The 2MB Constraint Is Handled

Large projects are handled on the read path in three layers:

1. initial project render boots with a cursor-paged task window
2. additional task windows are fetched from `/api/projects/{projectId}/tasks`
3. the task list is virtualized so the DOM only holds the visible rows

Steady-state collaboration still uses incremental events over SSE instead of rebroadcasting the whole project.

## Index Strategy

The read path is indexed for the exact queries the app issues:

- `events(project_id, version desc)` for event catch-up and versioned sync
- `events(project_id, entity_id, version desc)` for entity-local history
- `tasks(project_id, position)` for ordered task paging
- `tasks(project_id, status, position)` for status-scoped task reads
- `comments(task_id, created_at)` for task comment hydration

## API And DX

- OpenAPI contract: [docs/openapi.yaml](./docs/openapi.yaml)
- API notes: [docs/api.md](./docs/api.md)
- Architecture deep dive: [docs/architecture.md](./docs/architecture.md)
- Scaling notes: [docs/scaling.md](./docs/scaling.md)
- Load probes and results: [docs/load-testing.md](./docs/load-testing.md)
- Demo runbook: [docs/demo/runbook.md](./docs/demo/runbook.md)
- Continuous video script: [docs/demo/video-script.md](./docs/demo/video-script.md)

CI is defined in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) for the standalone project layout.

## Testing

```bash
bun run typecheck
bun run test
bun run test:e2e
```

Load probes:

```bash
bun run load:append
bun run load:task-page
```

## Honest Tradeoffs

Shipped:

- transactional event writes
- optimistic concurrency
- SSE fan-out
- Redis-capable event fan-out with in-memory fallback
- write-path rate limiting with `429` retry hints
- bounded SSE buffering with reconnect-driven recovery for slow consumers
- task dependencies and transition validation
- task/comment CRUD in the UI
- live cursor badges
- collaborative task descriptions
- mention notifications
- presence
- activity feed
- undo/redo
- Kanban drag-and-drop reorder through normal `task.update` events
- paged task reads
- virtualized benchmark rendering
- verified `10,000`-task seed path through the real event/projection pipeline
- verified `30,000`-task seed path through the real event/projection pipeline in `750.71s`
- load probes, OpenAPI, and CI config

Not shipped:

- real authentication
- offline replay
- distributed Redis fan-out
- multi-node soak benchmarks

Those are the next operational steps, not features being overstated as complete here.
