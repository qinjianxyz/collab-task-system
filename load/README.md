# Load Harness

Runnable probes that measure the scale path against the real app.

## Prerequisites

- Docker Desktop or a local PostgreSQL + Redis matching `docker-compose.yml`
- App running (`docker compose up --build`)

## Seed projects

Two seed scripts create projects through the real event-store API:

```bash
# realistic evaluator walkthrough (18 tasks, dependencies, comments)
bun run seed:demo

# scale benchmark (default 300, configurable)
bun run seed:scale
TASK_COUNT=10000 bun run seed:scale
TASK_COUNT=30000 bun run seed:scale
```

Both print JSON with a `url` you can open directly.

## Append throughput

Measures sequential event append latency through the HTTP API:

```bash
bun load/append-events.ts
ITERATIONS=200 bun load/append-events.ts
```

Prints min, max, average, and p95 latency per append.

## Paged task loading

Seeds a project and measures cursor-based task page fetch times:

```bash
bun load/task-page.ts
TASK_COUNT=10000 PAGE_LIMIT=50 REPETITIONS=16 bun load/task-page.ts
```

Reports first-page and follow-up-page latency separately, since the first page may pay a cold-cache penalty.
