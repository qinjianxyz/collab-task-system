# Collab Task System

Real-time collaborative task management built on event sourcing.

Two browser tabs. Sub-second sync. No Firebase, Supabase, or managed real-time database.

## Quick Start

```bash
docker compose up --build
# Open http://localhost:3000 in two browser tabs
```

If port `3000` is occupied:

```bash
APP_PORT=3100 docker compose up --build
```

The packaged stack includes PostgreSQL 17, Redis 7, and Next.js 16.

## Seed The Demo Projects

The repo ships two seeds because the product walkthrough and the scale walkthrough are different stories.

```bash
# realistic evaluator walkthrough — 18 tasks with dependencies, comments, and assignees
bun run seed:demo

# scale benchmark — default 300, configurable up to 30,000+
TASK_COUNT=10000 bun run seed:scale

# OSS-reference-grade stress proof
TASK_COUNT=30000 bun run seed:scale
```

Each command prints JSON with a `url`. Use:

- the demo URL for collaboration, domain behavior, undo/redo, and presence
- the scale URL for virtualized rendering, paged reads, and throughput measurement

## What You Can Do

- create and reopen multiple projects from the landing page
- create, update, and delete tasks with real-time sync across tabs
- add prerequisites with explicit `Blocked by` semantics
- enforce dependency rules and blocked status transitions on the server
- create, edit, and delete comments in real time
- undo with `Ctrl+Z`, redo with `Ctrl+Shift+Z`
- see live presence badges, cursor indicators, and an activity feed
- edit task descriptions collaboratively with a Yjs-backed shared document
- receive `@mentions` as durable notification projections
- switch between detailed list view and a drag-and-drop Kanban board
- open a 10,000+ task project that loads in paged windows and renders through a virtualized list

## Architecture

```text
                                append-only truth

  Browser A              Next.js API              PostgreSQL
  Browser B  ----->   validate command   ----->   events table
      |               lock project row           projections
      |               check expectedVersion      current_version
      |               apply projection
      |               commit event + version
      |                        |
      |                        v
      |                 Project event bus
      |              (Redis or in-memory fallback)
      |                        |
      +------ SSE stream <-----+
                 |
                 v
        all connected clients converge
```

### Sync Flow

```text
Client A                    Server                     Client B
   | optimistic apply         |                           |
   | POST /events             |                           |
   |------------------------->| validate + append +       |
   |                          | project in one tx         |
   |                          | publish committed event   |
   |                          |-------------------------->|
   |                          |      SSE project-event    |
   |<-------------------------|                           |
   | clear optimistic state   |                           |
   |                          |              apply event, update UI
```

### Why Event Sourcing Instead Of CRUD?

| Concern | CRUD-first design | This repo |
| --- | --- | --- |
| real-time sync | push full records or poll for diffs | stream committed events over SSE |
| undo/redo | separate history subsystem | inverse event appended to the same log |
| activity feed | custom audit path | projection over recent events |
| reconnect | refetch whole project | `events?since=N` catch-up |
| large projects | big payload churn | paged snapshot plus small events |
| conflict handling | last write wins or ad hoc merges | `expectedVersion` and `409` retry |

### Technology Choices

| Choice | Rationale |
| --- | --- |
| Next.js App Router | Server Components for the landing page, API routes co-located with the frontend, single deploy target |
| PostgreSQL | Append-only event table with `SERIALIZABLE` isolation for the write path; projections for fast reads |
| Redis | Pub/sub event bus for SSE fanout, ephemeral presence store, rate limiter — all with in-memory fallback so the app runs without Redis |
| Drizzle ORM | Type-safe schema, generated migrations, lightweight runtime |
| SSE over WebSocket | Unidirectional server-to-client stream is sufficient; writes go through HTTP with optimistic concurrency |
| Zod | Discriminated union event types shared across client and server — one schema, one source of truth |
| Yjs | CRDT-backed collaborative text editing for task descriptions without a custom OT implementation |

### How We'd Scale It Further

- **Horizontal read scaling** — read replicas for snapshot and task-page queries; the write path stays on the primary
- **Partitioned event bus** — shard Redis pub/sub by project ID so fanout cost grows with active projects, not total projects
- **Background projection workers** — decouple projection updates from the write transaction for higher append throughput
- **CDN edge caching** — cache snapshot responses at the edge with project-version ETags for instant cold loads
- **Full-text search** — PostgreSQL `tsvector` index on task titles and descriptions for in-project search at scale

## Scale Proof

### Features

- Paged snapshots and cursor-based task windows
- Virtualized task list rendering with incremental page loading
- Redis-backed event bus, presence store, and rate limiter with in-memory fallback
- Bounded SSE buffering for slow-consumer protection
- Seed scripts and load harnesses checked into the repo

### Measured Results

Local measurements against a production build with PostgreSQL 17 + Redis 7:

| Scenario | Result |
| --- | --- |
| 10,000 task seed | 209,839ms |
| Append throughput | 177.5 req/s, 56.06ms p95 |
| Paged initial load | 155.35ms p95 |
| Reconnect catch-up | 44.47ms p95 |
| SSE fanout (25 listeners) | 115.16ms p95 |

### Run It Yourself

```bash
# seed a 10,000 task project
TASK_COUNT=10000 bun run seed:scale

# measure append throughput
bun load/append-events.ts

# measure paged task loading
TASK_COUNT=10000 bun load/task-page.ts
```

See [load/README.md](./load/README.md) for details and env overrides.

## API Surface

Machine-readable: [docs/openapi.yaml](./docs/openapi.yaml)

| Route | Purpose |
| --- | --- |
| `POST /api/projects` | Create a project |
| `GET /api/projects/{id}/snapshot` | Paged project snapshot |
| `GET /api/projects/{id}/tasks` | Cursor-paginated task window |
| `POST /api/projects/{id}/events` | Append an event |
| `GET /api/projects/{id}/events` | Event history |
| `GET /api/projects/{id}/stream` | SSE event stream |

Full reference: [docs/api.md](./docs/api.md)

## Local Verification

```bash
bun run typecheck
bun run test        # unit + integration (bootstraps PostgreSQL + Redis automatically)
bun run test:e2e    # Playwright two-tab sync (bootstraps everything + installs Chromium)
```

## Further Reading

- [docs/architecture.md](./docs/architecture.md) — write path, projection model, reconnect, failure handling
- [docs/scaling.md](./docs/scaling.md) — read-path strategy, task windowing, virtualization, measured results
- [docs/api.md](./docs/api.md) — route reference and OpenAPI contract
- [docs/demo/README.md](./docs/demo/README.md) — demo walkthrough and video script
- [docs/operations.md](./docs/operations.md) — health checks and runtime config

## Project Structure

```text
app/
  api/                  # Next.js API routes (events, snapshot, stream, tasks)
  page.tsx              # Landing page (project catalog)
  projects/[id]/        # Project workspace page
docs/
  architecture.md       # Write path, projections, reconnect
  scaling.md            # Large-project strategy and measured results
  api.md                # Route reference
  openapi.yaml          # OpenAPI 3.1 contract
  demo/                 # Video script, runbook, slides
load/
  append-events.ts      # Append throughput probe
  task-page.ts          # Paged load probe
scripts/
  seed-demo-project.ts  # Realistic 18-task walkthrough seed
  seed-scale-project.ts # Configurable scale seed (10K+ tasks)
  dev-stack.ts          # Docker lifecycle for local dev
src/
  client/               # React components, sync hooks, API client
  server/               # Event store, projections, presence, rate limiter
  shared/               # Types and Zod schemas shared across client and server
test/
  e2e/                  # Playwright two-tab sync
  integration/          # API route and SSE stream tests
  unit/                 # Reducer, presence, history, types
```
