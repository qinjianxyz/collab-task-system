# Collab Task System

Real-time collaborative task management built on event sourcing.
Two browser tabs. Sub-second sync. No Firebase.

## Quick Start

```bash
docker compose up --build
# Open http://localhost:3000 in two browser tabs
```

If port `3000` is already occupied on your machine, run `APP_PORT=3100 docker compose up --build` and open `http://localhost:3100`.

## What You'll See

- Create a project, add tasks, change status, and watch both tabs converge in real time.
- Use `Ctrl+Z` / `Ctrl+Shift+Z` for undo and redo; inversions are ordinary events appended back through the same event store.
- Presence indicators show who is currently viewing the project.
- The activity feed updates live from the event stream.
- Task dependencies render in the UI, and blocked transitions show explicit validation errors.
- Optimistic UI applies changes instantly, then reconciles or retries on conflict.

## Architecture

```text
Client
  | POST event (expectedVersion)
  v
Event Store
  | append event + apply projection in one SQL transaction
  v
Postgres projections
  | publish committed event
  v
SSE stream
  | fan-out
  v
All connected clients
```

### Why event sourcing, not CRUD?

- **2MB+ constraint**: normal sync ships compact events, not full project documents.
- **Real-time**: SSE streams committed events directly to every viewer.
- **Undo/redo**: inversions are just more events; no separate undo subsystem.
- **Consistency**: monotonic project versions plus optimistic concurrency prevent lost updates.
- **Activity feed**: another projection over the same stream, not a bolt-on audit table.

### Sync Protocol

1. Client opens a project and fetches a snapshot.
2. Client subscribes to `/stream` over SSE and receives live events.
3. Client applies local changes optimistically, then POSTs the append command.
4. Server validates, assigns the next version, writes the event, updates projections, and broadcasts it.
5. On `409`, the client refreshes state, replays from the new version, and retries once.
6. On reconnect, the client asks for events since `lastVersion` instead of refetching the full project.

### How We'd Scale

- Redis pub/sub for cross-instance SSE fan-out.
- Cursor-based pagination and virtualization for very large task lists.
- Event log partitioning by `project_id`.
- Snapshot caching for hot projects with long histories.

### Tradeoffs

- No real auth yet; the demo identity is stored in `localStorage`.
- SSE fan-out is single-instance in `v0.1.0`.
- Presence is ephemeral and lost on server restart.
- Offline replay is not implemented yet, though the event contract is ready for it.

### Tech Stack

- Next.js 16 App Router, TypeScript strict, Zod validation.
- PostgreSQL 17 for the append-only event log and projection tables.
- SSE for real-time sync and presence fan-out.
- Vitest for unit and integration coverage.
- Playwright for two-tab end-to-end verification.
- Docker Compose for evaluator setup.

## Testing

```bash
bun run typecheck
bun run test
bun run test:e2e
```

## Project Structure

```text
app/
  api/
docs/
  architecture.md
drizzle/
scripts/
src/
  client/
    hooks/
    sync/
  server/
    db/
    domain/
    events/
    realtime/
  shared/
    types.ts
test/
  e2e/
  integration/
  unit/
```

See [docs/architecture.md](./docs/architecture.md) for the deeper design walkthrough.
