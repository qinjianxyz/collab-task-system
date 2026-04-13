# Collab Task System

Event-sourced collaborative task management with real-time sync, optimistic updates, undo/redo, presence, and measured scale proof.

Two browser tabs. Sub-second sync. No managed real-time database.

## Project Status

`v0.1.0` is pre-1.0 and intentionally opinionated.

- the core event-sourced architecture is stable enough for evaluation and OSS exploration
- API and storage contracts may still evolve before `v1.0`
- the `main` branch is the supported release line

## Quick Start

```bash
docker compose up --build
# Open http://localhost:3000 in two browser tabs
```

If port `3000` is occupied:

```bash
APP_PORT=3100 docker compose up --build
```

The packaged stack includes:

- PostgreSQL 17
- Redis 7
- Next.js 16

## What You’ll See

- create a project, add tasks, and watch two tabs converge over SSE
- undo/redo with `Ctrl+Z` / `Ctrl+Shift+Z`
- live presence and activity feed
- dependency-aware status transitions
- optimistic updates with `409` conflict recovery
- paged, virtualized task rendering for large projects

## Architecture At A Glance

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

## Sync In One Picture

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

## Why This Repo Exists

This project is an OSS reference implementation for an event-sourced collaborative app.

The point is not just “task CRUD with realtime.” The point is that:

- collaboration flows through one ordered event stream
- projections derive current state, activity, and sync behavior
- reconnect and scale paths avoid resending full project payloads
- undo/redo is ordinary event inversion, not a bolt-on subsystem

## Why Event Sourcing Instead Of CRUD?

| Concern | CRUD-first design | This repo |
| --- | --- | --- |
| real-time sync | push full records or poll for diffs | stream committed events over SSE |
| undo/redo | separate history subsystem | inverse event appended to the same log |
| activity feed | custom audit path | projection over recent events |
| reconnect | refetch whole project | `events?since=N` catch-up |
| large projects | big payload churn | paged snapshot plus small events |
| conflict handling | last write wins or ad hoc merges | `expectedVersion` and `409` retry |

## Scale Proof

Shipped scale features:

- paged snapshots and cursor-based task windows
- virtualized task rendering
- Redis-backed event bus, presence store, and rate limiter with in-memory fallback
- bounded SSE buffering for slow-consumer protection
- load harnesses and a `10,000` task seed script checked into the repo

Measured locally against a production build with PostgreSQL 17 + Redis 7:

| Scenario | Result |
| --- | --- |
| `10,000` task seed | `209,839ms` |
| append throughput | `177.5 req/s`, `56.06ms p95` |
| paged initial load | `155.35ms p95` |
| reconnect catch-up | `44.47ms p95` |
| SSE fanout | `25` listeners, `115.16ms p95` |

See [docs/scaling.md](./docs/scaling.md) and [load/README.md](./load/README.md).

## Further Reading

- [docs/architecture.md](./docs/architecture.md) — write path, projection model, reconnect, failure handling
- [docs/scaling.md](./docs/scaling.md) — read-path strategy, task windowing, virtualization, measured results
- [docs/api.md](./docs/api.md) — route reference and OpenAPI contract
- [docs/demo/README.md](./docs/demo/README.md) — demo walkthrough
- [docs/operations.md](./docs/operations.md) — health checks and runtime config

## API Surface

Machine-readable API contract:

- [docs/openapi.yaml](./docs/openapi.yaml)

Human-facing summary:

- [docs/api.md](./docs/api.md)

Routes covered:

- `POST /api/projects`
- `GET /api/projects/{projectId}/snapshot`
- `GET|POST /api/projects/{projectId}/events`
- `GET /api/projects/{projectId}/tasks`
- `GET /api/projects/{projectId}/stream`
- `GET /api/health`

## Local Verification

`bun run test` and `bun run test:e2e` bring up PostgreSQL and Redis through Docker automatically before running migrations and tests.

```bash
bun run typecheck
bun run test
bun run test:e2e
```

The first `bun run test:e2e` may download Chromium through Playwright and, on Linux, install the required browser system dependencies.

Scale helpers:

```bash
bun run load:seed
# see load/README.md for k6 and SSE fanout probes
```

## OSS Docs

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## Project Structure

```text
app/
  api/
docs/
load/
scripts/
src/
  client/
  server/
  shared/
test/
  e2e/
  integration/
  unit/
```
