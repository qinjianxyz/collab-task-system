# Architecture

## Core Idea

This system treats collaboration as a projection problem over one append-only stream per project.

The same event history drives:

- current project state
- real-time fan-out
- optimistic client reconciliation
- undo and redo
- activity feed
- future audit, rebuild, pagination, and notifications

CRUD systems usually build those concerns separately. This project does not.

## System Diagram

```text
Browser A            Browser B
   |                    ^
   | POST event         | SSE project-event / presence
   v                    |
      Next.js API routes
              |
              v
        Event store append
              |
     same SQL transaction
   event log + projections
              |
              v
        SSE broadcaster
```

## Event Model

Each write starts as an append command:

- `id`
- `entityId`
- `clientId`
- `userId`
- `timestamp`
- `expectedVersion`
- `action`

On commit, the server assigns:

- `version`
- optional `parentVersion` for inversions

Important invariants:

- versions are monotonic per project
- idempotency is scoped to `(project_id, event_id)`
- presence is explicit in the shared event union but is rejected from durable storage

## Persistence Model

PostgreSQL stores:

- `projects`
- `tasks`
- `comments`
- `events`

`events` is the source of truth. Projection tables are the read model used for snapshots, validation, and UI queries.

The critical rule is transactional coupling: appending the event and mutating the projections happen in the same transaction. If projection application fails, the event does not commit.

## Write Path

1. Parse the append command with shared Zod schemas.
2. Reject ephemeral writes such as `presence.update`.
3. Lock the target project row.
4. Check `expectedVersion` against `projects.current_version`.
5. Validate domain rules, including dependency DAG constraints and blocked status transitions.
6. Insert the event into `events`.
7. Apply projection updates.
8. Bump `projects.current_version`.
9. Commit.
10. Broadcast the committed event to SSE subscribers.

That gives strict ordering per project without requiring a global event coordinator.

## Read and Sync Path

The client starts from a snapshot, then stays current through incremental replay:

1. `GET /api/projects/:id/snapshot`
2. `GET /api/projects/:id/events?since=N` for backfill and activity seed
3. `GET /api/projects/:id/stream` over SSE for live convergence

The client hook keeps:

- the last committed server snapshot
- one optimistic overlay mutation
- undo and redo stacks
- live presence state
- live activity entries

When a client writes:

1. Apply the action optimistically.
2. POST the append command.
3. Reconcile with the committed event from the server.
4. If the server returns `409`, refresh the snapshot, backfill, and retry once.

## Presence

Presence is intentionally ephemeral:

- stored in an in-memory project map
- emitted over the same SSE channel as persisted events
- removed after a short disconnect timeout
- never written to Postgres

That keeps "who is viewing" lightweight and disposable.

## Undo and Redo

Undo and redo are client-driven inversions:

- `task.create` is undone by `task.delete`
- `comment.create` is undone by `comment.delete`
- updates are undone by reapplying the previous field values

The inverse event is appended like any other event, with `parentVersion` linking it to the version being reversed. The server does not need dedicated undo logic.

## Activity Feed

The activity feed is just another projection over recent events:

- load recent events from the event log
- format them into human-readable entries
- prepend new entries as committed events arrive

No background worker or extra persistence layer is required.

## Handling the 2MB Constraint

The take-home assumes project payloads may eventually exceed `2MB`.

This architecture avoids retransmitting whole projects during steady-state collaboration:

- initial load uses one snapshot
- live updates are small events
- reconnect uses version-based catch-up
- future pagination and virtualization fit naturally on top

That is the main architectural advantage over document-style CRUD sync.

## Current Tradeoffs

- single-instance SSE fan-out; Redis is the next scale step
- demo identity only; no real authentication yet
- no offline replay queue in `v0.1.0`
- no virtualized task list yet
- presence is lost on restart by design

## Verification Evidence

The project is verified by:

- unit tests for replay, validation, config guards, history inversion, and activity formatting
- integration tests for append ordering, snapshots, conflicts, and SSE fan-out
- Playwright tests for two-tab sync, presence, undo/redo, dependency errors, comments, and keyboard shortcuts
