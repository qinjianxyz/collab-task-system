# Collab Task System

Real-time collaborative task management built on an event log instead of CRUD.
Open the same project in two browser contexts, make a change in one, and the other converges over SSE without shipping the full project state again.

## What This Repository Proves

- Multiple projects can be created and opened from the same app.
- Tasks can be created, updated, blocked by prerequisites, and commented on in real time.
- Two browser contexts stay consistent through optimistic writes, ordered commits, and SSE fan-out.
- Undo and redo are ordinary events appended back through the same event store.
- Presence and the activity feed are projections over the same stream, not separate systems.
- The same architecture is future-proof for larger projects because it synchronizes deltas, not whole project documents.

## Quick Start

```bash
docker compose up --build
```

Open `http://localhost:3000`.

If `3000` is already busy on your machine:

```bash
APP_PORT=8100 docker compose up --build
```

Then open `http://localhost:8100`.

## Seed The Two Demo Projects

The repository ships two separate seeds because the evaluator path and the scale path are different stories.

```bash
# realistic product walkthrough
APP_PORT=8100 bun run seed:demo

# benchmark dataset for long-list / larger-project walkthrough
APP_PORT=8100 TASK_COUNT=300 bun run seed:scale
```

Each command prints JSON with a `url` field. Use the first URL for the product demo and the second URL for the benchmark walkthrough.

## What You Can Demo Right Now

### Product Walkthrough

- Create or open a project.
- Add a task and select prerequisite tasks under `Blocked by`.
- Open the same project in a second browser context.
- Change status, add comments, and watch both clients converge.
- Press `Ctrl+Z` / `Ctrl+Shift+Z` for undo and redo.
- Use `?` to open keyboard shortcuts.
- Show presence chips and the live activity feed.

### Why The Dependency UI Looks The Way It Does

The composer does not use the checkbox list as a completion control. Each selected row means:

`this new task is blocked by this existing task`

That is why the UI is labeled `Blocked by`, why completed tasks are hidden by default, and why blocked transition errors name the exact prerequisite that still needs to finish.

## Architecture At A Glance

```text
Browser A                      Browser B
   |                              ^
   | POST append command          | SSE committed event / presence
   v                              |
        Next.js route handlers
                 |
                 v
        append event to Postgres
      + apply projection in the
         same SQL transaction
                 |
                 v
       publish committed version
                 |
                 v
            SSE broadcaster
```

This is the core claim of the project:

- the event log is the source of truth
- read models are projections
- the client sync loop converges on committed versions
- collaboration features are projections over the same stream

## Why Event Sourcing Is The Right Fit

### Versus CRUD

| Concern | CRUD-first design | This repository |
| --- | --- | --- |
| Real-time sync | bolt on sockets/polling around mutable rows | stream committed events |
| Undo/redo | separate undo tables or ad hoc snapshots | invert the original event |
| Activity feed | separate audit subsystem | projection over the same event log |
| Conflict handling | last write wins or ad hoc merges | optimistic concurrency with `expectedVersion` |
| Large payloads | resend large objects or diff whole documents | ship small events after initial load |

### Why SSE Instead Of WebSockets

This app only needs server-to-client fan-out after a client POSTs an append command. SSE is enough for that shape:

- simple HTTP route
- built-in browser reconnect behavior
- easy version-based catch-up
- no extra socket protocol for the evaluator path

## Sync Flow

1. The client loads a project snapshot.
2. The client opens `/api/projects/:id/stream`.
3. A local mutation is applied optimistically.
4. The client POSTs an append command with `expectedVersion`.
5. The server validates, commits the next version, updates projections, and broadcasts it.
6. Other clients apply the committed event.
7. On `409`, the client refreshes state and retries once against the latest version.

That is how two browsers stay consistent without a managed realtime database.

## Realistic Demo Project vs Scale Project

### Realistic Demo Project

The realistic seed is `Ship Collab Task System`.

It is intentionally narrative:

- named owners
- meaningful task titles
- comments and `@mentions`
- dependency chains
- blocked work, active work, and completed work

Use this project when the evaluator wants to see product quality and collaboration behavior.

### Scale Benchmark Project

The benchmark seed is intentionally synthetic:

- stable ordering
- many tasks
- predictable metadata
- repeated comments at anchor points

Use this project when the evaluator wants to inspect larger-project behavior and discuss the scaling path.

## Current State And Honest Tradeoffs

What is already shipped:

- event-sourced write path
- transactional projections
- SSE-based two-context sync
- optimistic UI with conflict retry
- undo/redo
- presence
- activity feed
- realistic demo seed and benchmark seed
- unit and integration coverage around event logic and seed generation

What is not yet shipped in this worktree:

- real authentication
- offline replay
- cross-instance Redis fan-out
- virtualized task rendering
- cursor-based pagination

Those next steps are documented because the architecture already supports them, but they are not being claimed as finished features here.

## Why This Is Still A Strong Take-Home Solution

The rubric is about architecting a scalable collaborative system without relying on a managed realtime database. This repository answers that directly:

- it uses Next.js App Router
- it keeps the write path transactional
- it handles cross-client consistency explicitly
- it transmits incremental updates instead of full project payloads
- it models collaboration features as projections over an event log

That is a more defensible foundation than a CRUD app with realtime bolted on later.

## Testing

```bash
bun run typecheck
bun run test
bun run test:e2e
```

## Demo And Architecture Docs

- [Architecture](./docs/architecture.md)
- [Scaling Notes](./docs/scaling.md)
- [Demo Index](./docs/demo/README.md)
- [Demo Runbook](./docs/demo/runbook.md)
- [Continuous Video Script](./docs/demo/video-script.md)
