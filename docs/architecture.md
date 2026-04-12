# Architecture

## Core Idea

This system treats collaboration as a projection problem over one append-only stream per project.

The same event history drives:

- current project state
- real-time SSE fanout
- optimistic client reconciliation
- undo and redo
- presence snapshots
- activity feed entries
- future rebuilds, audit, and notifications

That is the architectural difference from a CRUD app with realtime bolted on later.

## System Diagram

```text
Browser A / Browser B
        | optimistic action
        v
  Next.js API route
        |
        | validate + append + project
        | one SQL transaction
        v
    PostgreSQL
   events + projections
        |
        | publish committed event
        v
 Project event bus
  | in-memory fallback
  | or Redis pub/sub
        v
   SSE stream route
  | bounded queue
  | heartbeat
        v
 Connected clients
```

## Event Model

Every mutation is explicit in a discriminated union.

Write requests send:

- `id`
- `entityId`
- `clientId`
- `userId`
- `timestamp`
- `expectedVersion`
- `action`

On commit, the server assigns:

- `version`
- optional `parentVersion`

Important invariants:

- project versions are monotonic
- idempotency is scoped to `(project_id, event_id)`
- `presence.update` is part of the shared model but rejected from durable storage
- append + projection happens in the same transaction

## Persistence Model

PostgreSQL stores:

- `projects`
- `tasks`
- `comments`
- `events`

`events` is the source of truth. Projection tables exist to serve snapshots, domain validation, and UI queries efficiently.

The critical rule is transactional coupling:

1. insert event
2. apply projection
3. bump project version
4. commit

If projection application fails, the event does not commit.

## Write Path

1. Parse the append command with shared Zod schemas.
2. Reject ephemeral mutations such as durable `presence.update`.
3. Lock the target project row.
4. Check `expectedVersion` against `projects.current_version`.
5. Validate dependency DAG constraints and blocked status transitions.
6. Insert the event into `events`.
7. Apply the projection updates.
8. Update `projects.current_version`.
9. Commit.
10. Publish the committed event to the project event bus.

The bus selects:

- in-memory `EventEmitter` for single-instance demos
- Redis pub/sub when `REDIS_URL` is configured

## Read Path

The read path is now explicitly paged.

Initial load:

1. `GET /api/projects/:id/snapshot?taskLimit=100`
2. server returns project metadata, current version, and the first task window
3. comments are scoped to the loaded tasks only

Incremental load:

1. `GET /api/projects/:id/tasks?after=<cursor>&limit=100`
2. cursor ordering is stable on `(position, id)`
3. client merges the next page into the loaded window

Render path:

- the client virtualizes task cards
- only the visible task window is mounted in the DOM
- dependency selection is capped to a filtered subset of loaded tasks so the form does not recreate the large-list problem

## Sync Path

The client hook keeps:

- the last committed server snapshot
- one optimistic overlay mutation
- undo and redo stacks
- presence state
- activity entries

Steady-state sync:

1. fetch snapshot
2. subscribe to `/stream`
3. apply optimistic change locally
4. POST append command
5. receive committed event over SSE
6. clear optimistic overlay

Conflict path:

1. server returns `409`
2. client refetches snapshot
3. client fetches events since the last known version
4. client retries once with fresh state

Reconnect path:

1. stream disconnects
2. client preserves `lastVersion`
3. client calls `/events?since=<lastVersion>`
4. client reapplies missed events

## Presence

Presence is ephemeral by design.

Shipped behavior:

- in-memory presence store for single-instance demos
- Redis-backed presence store when `REDIS_URL` is configured
- disconnect TTL before removal
- SSE broadcast of full viewer snapshots

Presence never goes to Postgres.

## Stream Protection

The SSE route now uses a bounded buffer:

- chunks are queued before writing to the stream controller
- when the controller is backpressured, writes pause
- if the queue overflows, the stream is closed
- the client is expected to recover through `/events?since=...`

That keeps one slow consumer from creating unbounded memory pressure on the server.

## Write Protection

Both write routes are rate limited:

- `POST /api/projects`
- `POST /api/projects/:id/events`

Shipped behavior:

- in-memory fixed-window limiter by default
- Redis-backed limiter when `REDIS_URL` is configured
- `429` responses with `Retry-After`

The defaults are intentionally generous for the demo path, but the protection is there for real traffic and scripted abuse.

## Undo, Redo, and Activity

Undo and redo are client-driven inversions:

- `task.create` -> `task.delete`
- `comment.create` -> `comment.delete`
- updates -> inverse updates with previous field values

The inverse is appended as a normal event with `parentVersion`.

The activity feed is another projection over recent events:

- load recent history from the log
- format human-readable summaries
- prepend new committed events as they arrive

No extra persistence layer is needed.

## Handling the 2MB Constraint

The take-home explicitly assumes projects may eventually exceed `2MB`.

This architecture addresses that constraint directly:

- initial load ships a paged snapshot
- steady-state sync ships small events
- reconnect uses event catch-up instead of full project reloads
- the UI mounts only a virtual window of loaded tasks

That is why event sourcing plus paged projections is a better fit than document-style CRUD sync.

## Current Tradeoffs

- Auth is still demo-only.
- Offline replay is still future work.
- Redis-backed abstractions are exercised in automation through independent Redis-backed instances and stream-race coverage, but the suite still does not orchestrate multiple full app containers behind shared Redis.
- Event partitioning and snapshot caching are documented next steps, not shipped migrations.

## Verification Evidence

Verified in this repo by:

- unit tests for replay, validation, history inversion, pagination, presence, buffering, and rate limiting
- integration tests for append ordering, snapshots, conflicts, SSE delivery, reconnect catch-up, and route limits
- Playwright tests for two-tab sync, presence, undo/redo, dependency errors, comments, shortcut help, and large-list pagination
- load probes in `load/` plus the large-project seed script in `scripts/`
