# Scaling Proof

## Goal

This document records the concrete proof that the current implementation handles the assignment's large-project and realtime constraints with shipped code, not only with architecture notes.

## Test Environment

- Next.js 16 production build
- PostgreSQL 17
- Redis 7
- local app process on `127.0.0.1:3100`
- seeded project created through the same `appendEvent()` path used by the app

The measurements below were captured on April 11, 2026 against the exact code in this repository.

## Seeded Dataset

Command:

```bash
TASK_COUNT=10000 bun scripts/seed-large-project.ts
```

Observed result:

- `10,000` tasks
- seed duration: `209,839ms`
- seeded project id during this run: `b60fd3ec-2071-4e9a-8c9d-f9dbcaa426b8`

This seed goes through the real event store and projection path, so the dataset reflects actual append cost and projection updates instead of direct table inserts.

## Measured Scenarios

### 1. Append Throughput

Command:

```bash
docker run --rm -i \
  -e BASE_URL=http://host.docker.internal:3100 \
  -e VUS=6 \
  -e DURATION=15s \
  -v "$PWD/load:/scripts" \
  grafana/k6 run /scripts/append-throughput.js
```

Observed result:

- `2,713` successful appends
- `177.5 req/s`
- `32.98ms` average request duration
- `56.06ms p95`
- `0%` failures

Interpretation:

- append + projection + broadcast stayed comfortably below the sub-100ms target at `p95`
- optimistic concurrency is preserved because each VU writes to its own project stream in order

### 2. Paged Initial Load

Command:

```bash
docker run --rm -i \
  -e BASE_URL=http://host.docker.internal:3100 \
  -e PROJECT_ID=b60fd3ec-2071-4e9a-8c9d-f9dbcaa426b8 \
  -e VUS=20 \
  -e ITERATIONS=200 \
  -v "$PWD/load:/scripts" \
  grafana/k6 run /scripts/paged-initial-load.js
```

Observed result:

- `155.35ms p95`
- `84.56ms` average HTTP request duration
- `0%` failures

Interpretation:

- snapshot loading stays bounded because the server returns only the first task window
- the second page fetch remains cheap enough to keep the browser-side "load more" path responsive

### 3. Reconnect Catch-Up

Command:

```bash
docker run --rm -i \
  -e BASE_URL=http://host.docker.internal:3100 \
  -e PROJECT_ID=b60fd3ec-2071-4e9a-8c9d-f9dbcaa426b8 \
  -e VUS=30 \
  -e ITERATIONS=300 \
  -e CATCHUP_WINDOW=250 \
  -v "$PWD/load:/scripts" \
  grafana/k6 run /scripts/reconnect-pressure.js
```

Observed result:

- `44.47ms p95`
- `32.38ms` average HTTP request duration
- `0%` failures

Interpretation:

- catch-up requests over `/events?since=N` are significantly cheaper than reshipping a full project
- the reconnect path stays fast even when the client asks for a recent slice of the event stream repeatedly

### 4. SSE Fanout

Command:

```bash
BASE_URL=http://127.0.0.1:3100 \
LISTENERS=25 \
EVENT_COUNT=5 \
mise exec node@22 -- node load/realtime-fanout.js
```

Observed result:

- `25` live listeners
- `5` committed events
- `43.33ms` mean end-to-end delivery latency
- `115.16ms p95`
- `115.64ms` max latency

Interpretation:

- the Redis-backed bus plus bounded SSE route preserves sub-120ms delivery to 25 concurrent listeners in a single-process app run
- this is the "two tabs, then many tabs" proof that the collaboration path stays event-driven instead of snapshot-driven

## What This Proves

The shipped code now demonstrates:

- large-project snapshots are paged
- browser rendering stays bounded via virtualization
- reconnects are event-based, not full-state replays
- write protection and stream backpressure are in place
- the Redis path is real and exercised by the app runtime

## What Is Still Next

- multi-app-instance load verification behind a shared Redis bus
- physical event-table partitioning migrations
- snapshot caching for very hot projects
- a dedicated SSE fanout load runner that can scale beyond a single local machine

Those are next optimizations, not missing foundations.
