# Scaling Notes

## The Constraint

The take-home explicitly says project payloads can eventually exceed `2MB` and that the system should avoid retransmitting the whole project after every change.

This repository handles that in two layers:

```text
initial project render
  -> first task window only

steady-state collaboration
  -> committed events over SSE

long task lists
  -> cursor-paged task windows
  -> virtualized DOM rendering
```

## Read Path Shape

```text
GET /projects/:id
  -> project metadata
  -> first task window (limit 32)
  -> comments scoped to those task ids

scroll near end of loaded window
  -> GET /api/projects/:id/tasks?after=<cursor>&limit=32
  -> merge next task window into local state
  -> keep only visible rows in the DOM
```

Why this matters:

- the browser does not hydrate a 10k-row task list on first load
- later task pages are stable because paging is ordered by `(position, id)`
- comment payloads stay scoped to the visible task window

## Index Strategy

The Postgres schema is indexed to match the actual hot paths:

- `events_project_version_desc_idx` on `(project_id, version desc)` for ordered catch-up reads
- `events_project_entity_version_idx` on `(project_id, entity_id, version desc)` for entity history and replay support
- `tasks_project_position_idx` on `(project_id, position)` for cursor-paged task windows
- `tasks_project_status_position_idx` on `(project_id, status, position)` for status-filtered reads
- `comments_task_created_at_idx` on `(task_id, created_at)` for scoped comment hydration

Those indexes are defined in [`src/server/db/schema.ts`](../src/server/db/schema.ts) and materialized through [`drizzle/0000_phase1.sql`](../drizzle/0000_phase1.sql).

## Cursor Design

The cursor is a base64url-encoded JSON payload:

```json
{"position": 42, "id": "task_123"}
```

That supports stable paging:

```sql
where (position, id) > ($position, $id)
order by position asc, id asc
limit $limit_plus_one
```

This avoids ambiguity when multiple tasks share the same `position`.

## Virtualized Rendering

The benchmark view uses a virtualized scroll window on top of the loaded task pages:

- the server fetches only the next task page
- the client renders only the visible slice of the loaded window
- the first task drops out of the DOM once the user scrolls deep enough into the benchmark list

That means the scale story is not only about API pagination. The browser rendering strategy changes too.

## Write Path Still Stays Incremental

The scale optimization does not change the write model:

- writes still append events
- projections still update transactionally
- clients still converge from ordered committed versions

So the scale improvements are read-model improvements, not architectural compromises.

## Local Load Probe Results

Measured on April 12, 2026 against a local production build on loopback:

| Probe | Average | P95 | Min | Max |
| --- | ---: | ---: | ---: | ---: |
| Append `task.create` x30 | 43.46 ms | 88.77 ms | 20.40 ms | 143.15 ms |
| First task page `limit=32` x6 | 29.75 ms | 62.82 ms | 19.14 ms | 62.82 ms |
| Follow-up task page x6 | 18.28 ms | 22.38 ms | 16.06 ms | 22.38 ms |

See [load-testing.md](./load-testing.md) for the scripts and exact commands.

The benchmark seed is configurable. For the challenge case, the same seed path supports:

```bash
APP_PORT=8100 TASK_COUNT=10000 bun run seed:scale
```

An actual `10,000` task seed was run on April 12, 2026 through the real append/projection path and completed in `210.34s`. That is intentionally slower than a bulk loader because it exercises the same event-sourced write path the product uses in production.

An actual `30,000` task seed was also run on April 12, 2026 through that same path and completed in `750.71s`.

Measured against the resulting `30,000` task project on a local production build:

| Probe | Average | P95 | Min | Max |
| --- | ---: | ---: | ---: | ---: |
| First task page `limit=32` x6 | 24.63 ms | 75.43 ms | 13.19 ms | 75.43 ms |
| Follow-up task page x6 | 13.97 ms | 17.31 ms | 12.44 ms | 17.31 ms |

The Playwright benchmark test uses a smaller fixture for speed, but the paging and virtualization logic is the same.

## What Is Still Next

Shipped here:

- cursor-based task pages
- virtualized benchmark rendering
- deterministic ordering and scoped comments
- lightweight local load probes

Still next:

- Redis-backed cross-instance fan-out
- multi-node load tests
- long-running soak and reconnect churn benchmarks
- true offline replay queues
