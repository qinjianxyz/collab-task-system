# Architecture

## Core Thesis

This project treats collaboration as an ordered event stream, not a set of mutable rows.

That single decision simplifies the rest of the system:

- writes become explicit append commands
- read models become projections
- sync becomes versioned event replay
- activity becomes another projection
- undo becomes inversion of prior events

## System Shape

```text
Client
  |
  | 1. optimistic local apply
  | 2. POST append command
  v
Next.js route handler
  |
  | parse + validate + check expectedVersion
  v
append-only event log
  +
projection tables
  |
  | same SQL transaction
  v
committed project version
  |
  | publish committed event
  v
SSE stream
  |
  v
all connected clients
```

## Durable Write Path

```text
append command
  -> parse with shared Zod schema
  -> reject ephemeral presence writes
  -> lock project version
  -> validate dependency and transition rules
  -> insert event
  -> apply projection updates
  -> bump project current_version
  -> commit
  -> broadcast committed event
```

Key invariant:

`the event is not durable unless the projection update succeeds`

That keeps the event log and the read model in sync without background repair jobs in the main path.

## Event Model

Every mutation is explicit in the shared discriminated union:

- `project.create`
- `project.update`
- `task.create`
- `task.update`
- `task.delete`
- `comment.create`
- `comment.update`
- `comment.delete`
- `presence.update` for ephemeral collaboration state

The server stores durable events in Postgres and rejects ephemeral presence writes from the event log.

## Read Model

Postgres stores four primary tables:

- `projects`
- `tasks`
- `comments`
- `events`

`events` is the source of truth. The other tables are projection tables optimized for:

- snapshot reads
- dependency validation
- UI rendering
- comment lookup

## Sync Model

```text
initial load
  -> fetch snapshot

steady state
  -> open SSE stream
  -> apply committed events as they arrive

write
  -> optimistic local apply
  -> POST append command
  -> reconcile against committed server version

conflict
  -> refresh snapshot
  -> retry once with latest expectedVersion
```

This is enough for the take-home because the client only needs server-to-client fan-out after writes commit.

## Dependency Semantics

Dependencies are represented as `task.dependencies[]`.

The product language is:

- `Blocked by` in the task composer
- `Blocked by:` on task cards

The server enforces two rules:

1. dependency edges must remain acyclic
2. a task cannot move into `in_progress` while a prerequisite task is not `done`

That means the UI can be optimistic, while the server still remains the final authority for consistency.

## Presence And Activity

These are intentionally lightweight:

- presence is ephemeral and broadcast over SSE
- activity is formatted from the same stream of committed events

Neither feature introduces a second source of truth.

## Undo And Redo

Undo and redo are client-driven event inversion:

- undo a create with a delete
- undo an update with the prior field values
- redo by appending the forward action again

The server stays simple because it only needs to validate and commit normal events.

## Why This Beats CRUD For This Problem

The take-home asks for:

- cross-client consistency
- realtime updates
- future-proof handling of larger project payloads
- no managed realtime database

Event sourcing matches that better than CRUD because the system can transmit and reason about small, ordered changes instead of repeatedly serializing the whole project.

## Honest Boundaries

This worktree currently proves:

- transactional event writes
- ordered SSE sync
- optimistic conflict recovery
- collaboration projections
- realistic demo data

It does not yet prove:

- distributed fan-out across many app instances
- offline replay
- virtualized rendering or cursor pagination

Those are natural extensions of the same architecture, but they are intentionally not overstated here.
