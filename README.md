# Collab Task System

Real-time collaborative task management built on event sourcing.
Two browser tabs. Sub-second sync. No Firebase, Supabase, or managed real-time database.

## Quick Start

```bash
docker compose up --build
# Open http://localhost:3000 in two browser tabs
```

If port `3000` is already occupied:

```bash
APP_PORT=3100 docker compose up --build
```

The compose stack now includes:

- PostgreSQL 17
- Redis 7
- Next.js app

## What You'll See

- Create a project, add tasks, and change status in one tab; the second tab converges over SSE in well under a second.
- Undo and redo with `Ctrl+Z` / `Ctrl+Shift+Z`; inversions go back through the same event store.
- Presence indicators showing who is viewing the project right now.
- A live activity feed driven by the same committed event stream.
- Task dependencies with blocked transition errors surfaced in the UI.
- Optimistic updates that render instantly, then reconcile or retry on conflict.
- A paged, windowed task list that stays bounded for large projects.

## Scale Proof

The app now ships the scale path instead of only describing it:

- paged snapshots: `GET /snapshot?taskLimit=100`
- task window pagination: `GET /tasks?after=<cursor>&limit=100`
- virtualized task rendering in the browser
- Redis-backed event bus and presence store when `REDIS_URL` is configured
- bounded SSE buffers for slow-consumer protection
- write-path rate limiting with `429` and `Retry-After`

Measured locally against a production build on `127.0.0.1:3100` with PostgreSQL 17 + Redis 7:

| Scenario | Command shape | Result |
| --- | --- | --- |
| Large seed | `TASK_COUNT=10000 bun scripts/seed-large-project.ts` | `10,000` tasks seeded in `209,839ms` |
| Append throughput | `k6 run load/append-throughput.js` with `6` VUs for `15s` | `2,713` successful appends, `177.5 req/s`, `56.06ms p95` |
| Paged initial load | `k6 run load/paged-initial-load.js` with `20` VUs / `200` iterations | `155.35ms p95`, `0%` failures |
| Reconnect catch-up | `k6 run load/reconnect-pressure.js` with `30` VUs / `300` iterations | `44.47ms p95`, `0%` failures |
| SSE fanout | `node load/realtime-fanout.js` with `25` listeners / `5` events | `43.33ms` mean, `115.16ms p95` |

The load harness lives in [`load/README.md`](./load/README.md). The deeper write-up is in [`docs/scaling.md`](./docs/scaling.md).

## Architecture

```text
Browser
  | POST append command (expectedVersion)
  v
Next.js API route
  | validate + append event + apply projection
  | one SQL transaction
  v
PostgreSQL
  | publish committed event
  v
Project event bus
  | in-memory fallback or Redis pub/sub
  v
SSE stream
  | bounded buffer + heartbeat
  v
Connected clients
```

### Why event sourcing instead of CRUD?

- **2MB+ payload constraint**: steady-state sync ships compact events, not full project documents.
- **Consistency**: optimistic concurrency is anchored to a monotonic project version.
- **Undo/redo**: inverse operations are normal events, not a special subsystem.
- **Realtime**: clients converge by replaying ordered events instead of replacing whole snapshots.
- **Audit/activity**: the feed is another projection over the same durable stream.

### Sync Protocol

1. Client opens a project and fetches a paged snapshot.
2. Client subscribes to `/stream` over SSE.
3. Client applies local changes optimistically, then POSTs the append command.
4. Server validates, assigns the next version, commits the event and projections, then broadcasts it.
5. On `409`, the client refreshes state, backfills missed events, and retries once.
6. On reconnect, the client uses `/events?since=<lastVersion>` instead of fetching a full project again.

### Shipped Scale Features

- Cursor pagination for task windows ordered by `(position, id)`.
- Virtualized task rendering so the DOM stays bounded even after loading more pages.
- Redis-backed event bus, presence store, and write limiter when `REDIS_URL` is present.
- In-memory fallbacks for single-instance local demos.
- SSE buffering with a bounded queue; slow consumers are disconnected and expected to recover via `/events?since=...`.
- Load harnesses and seeded large-project generation checked into the repo.

### Tradeoffs

- No real auth yet; identity is still demo-grade and stored in `localStorage`.
- Offline replay is not implemented yet.
- Redis-backed multi-instance behavior is shipped, but the automated suite still exercises only the single-app process path.
- The event log is indexed and versioned, but physical table partitioning is still a next step rather than a shipped migration.

## Testing

```bash
bun run typecheck
bun run test
bun run test:e2e
```

Load-proof helpers:

```bash
bun scripts/seed-large-project.ts
# see load/README.md for k6 and SSE probe commands
```

## Project Structure

```text
app/
  api/
docs/
  architecture.md
  operations.md
  scaling.md
load/
scripts/
src/
  client/
    components/
    hooks/
    sync/
  server/
    api/
    db/
    domain/
    events/
    realtime/
  shared/
    api.ts
    types.ts
test/
  e2e/
  integration/
  unit/
```

## More Detail

- [`docs/architecture.md`](./docs/architecture.md)
- [`docs/scaling.md`](./docs/scaling.md)
- [`docs/operations.md`](./docs/operations.md)
