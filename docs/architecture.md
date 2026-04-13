# Architecture

## Core Thesis

Collab Task System treats collaboration as an ordered event stream, not as mutable rows with realtime bolted on afterward.

That gives one durable source of truth for:

- project state
- realtime sync
- undo/redo
- activity
- notifications
- future audit and derived projections

## System Shape

```text
Browser
  | optimistic local apply
  | POST append command
  v
Next.js route handler
  | parse + validate
  | expectedVersion check
  v
append-only events table
  + projection tables
  | same SQL transaction
  v
committed project version
  | publish committed event
  v
SSE stream
  v
connected clients
```

## Durable Write Path

```text
append command
  -> reject malformed input
  -> reject stale expectedVersion
  -> validate dependency graph and status transition rules
  -> insert event
  -> apply projection update
  -> bump project current_version
  -> commit
  -> broadcast committed event
```

Key invariant:

`an event is not durable unless the projection update succeeds in the same transaction`

That keeps the log and read model aligned without an asynchronous repair loop in the primary path.

## Event Model

The shared discriminated union makes every mutation explicit:

- `project.create`
- `project.update`
- `task.create`
- `task.update`
- `task.delete`
- `comment.create`
- `comment.update`
- `comment.delete`
- `presence.update` for ephemeral viewers

Durable events are stored in Postgres. Presence is intentionally ephemeral and kept out of the durable event log.

Collaborative descriptions are intentionally split:

- live shared editing flows through a task-scoped Yjs document
- durable checkpoints still land in the event log via `task.update`

That keeps the system honest: the user gets multiplayer text editing, but the long-term record still lives in the same task model as every other durable mutation.

## Read Model

Postgres stores:

- `projects`
- `tasks`
- `comments`
- `notifications`
- `events`

`events` is the source of truth. The projection tables exist for:

- current snapshot reads
- dependency validation
- paged task windows
- comment lookup without replaying the entire event stream
- durable mention notifications without replaying comment history

## Sync Model

```text
initial render
  -> server renders first task window

live collaboration
  -> open SSE stream
  -> apply committed events

local write
  -> optimistic local apply
  -> POST append command
  -> reconcile against committed event

conflict
  -> refresh from server
  -> retry once with latest version
```

This keeps the transport simple:

- HTTP POST for writes
- SSE for fan-out
- ordered versions for reconciliation
- bounded SSE buffers with reconnect-based catch-up for slow consumers

## Dependency Semantics

Dependencies live in `task.dependencies[]`.

The UX language is intentionally explicit:

- composer: `Blocked by`
- task card: `Blocked by:`

The server enforces:

1. no dependency cycles
2. no move to `in_progress` while a prerequisite is unfinished
3. no delete of a task that another task still depends on

That means the UI can stay optimistic without being the final source of domain truth.

## Comments

Comments are events too:

- create
- edit
- delete

The server now rejects comment updates and deletes when the target comment does not exist, so the client cannot drift into successful no-op edits.

## Undo And Redo

Undo and redo are client-driven event inversion:

- create -> delete
- update -> inverse update with prior values
- delete -> recreate with prior values

The server does not have a special undo subsystem. It only validates and commits normal events.

## Read-Path Scale Shape

The scale path is intentionally separate from the write model:

```text
server render
  -> first task page only

scroll near end
  -> fetch next task page by cursor

render
  -> virtualize the loaded task window
```

This improves the cost of large projects without compromising the event-sourced architecture.

## Collaboration Layers

```text
durable collaboration
  -> events table
  -> tasks/comments/notifications projections

ephemeral collaboration
  -> presence store
  -> live cursor payloads
  -> task-scoped Yjs document streams
```

This split is deliberate:

- Postgres answers "what is the durable project history?"
- SSE answers "what just committed and who is active right now?"
- task-doc channels answer "what is the current shared description buffer?"

The SSE layer is intentionally defensive:

- streams emit heartbeats every 15 seconds
- buffered SSE writes are bounded
- if a consumer falls behind, the stream closes and the client reconnects from the last committed version

## Mention Notifications

Comment mentions are parsed during projection updates and written into the `notifications` table.

That means notifications:

- survive reloads
- are queryable without replaying the full stream
- remain derived from the same comment events as the rest of the system

There is no separate notification write path.

## Board View

Kanban is an alternate projection over the same task model:

- columns are `TaskStatus`
- card order is `position`
- drag-and-drop emits a normal `task.update` with the new `status` and `position`

The board does not create a second ordering model. It reuses the same fields the list view already understands.

## Why This Beats CRUD For This Problem

The rubric asks for:

- cross-client consistency
- near real-time updates
- future-proof behavior for large project payloads
- no managed realtime backend

Event sourcing fits that better than CRUD because the system ships small, ordered changes and paged reads instead of repeatedly serializing a giant mutable document.

## Boundaries

Shipped here:

- transactional append + projection writes
- optimistic concurrency
- SSE-based collaboration
- live cursor badges
- collaborative description editing
- mention notifications
- Kanban drag-and-drop
- task/comment lifecycle UI
- presence and activity
- cursor-based task paging
- virtualized benchmark rendering

Still next:

- real auth
- offline replay
- Redis-backed fan-out across multiple app instances
- multi-node performance validation
