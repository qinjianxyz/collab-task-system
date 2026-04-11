# Operations

## Runtime Modes

This project supports two modes:

- single-instance fallback with in-memory event bus, presence, and rate limiting
- Redis-backed mode when `REDIS_URL` is configured

The Docker Compose stack now starts Redis by default so the packaged runtime exercises the distributed-capable path.

## Services

`docker compose up --build` starts:

- `postgres` on `54329`
- `redis` on `6379`
- `app` on `${APP_PORT:-3000}`

If host port `3000` is busy:

```bash
APP_PORT=3100 docker compose up --build
```

## Required Environment

### App

- `DATABASE_URL`
  - required in production
  - local development falls back to `postgres://postgres:postgres@localhost:54329/collab_task_system`
- `REDIS_URL`
  - optional for local single-instance work
  - recommended and enabled in Docker Compose

### Operational Tunables

- `WRITE_RATE_LIMIT_LIMIT`
  - default: `120`
- `WRITE_RATE_LIMIT_WINDOW_MS`
  - default: `60000`
- `SSE_BUFFER_LIMIT`
  - default: `64`

These values are intentionally generous for the demo but can be tightened in production.

## Local Development

```bash
bun install
bun run db:up
bun run db:migrate
bun run dev
```

Fallback stack helper:

- `bun run db:up` starts Postgres and Redis
- `bun run db:down` tears them down
- `bun run db:reset` recreates the local database and reruns migrations

## Production-Like Local Run

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/collab_task_system \
REDIS_URL=redis://127.0.0.1:6379 \
NODE_ENV=production \
bun run build && bun run start -- --hostname 127.0.0.1 --port 3000
```

## Failure Modes

### Redis unavailable

- event bus falls back to in-memory only if the app started without `REDIS_URL`
- if `REDIS_URL` is configured but Redis becomes unavailable at runtime, publish/subscribe errors are swallowed to preserve request handling, but cross-instance fanout will degrade

### Slow SSE consumers

- the stream route buffers chunks in a bounded queue
- if the queue overflows, the stream is closed
- clients are expected to recover through `/events?since=<lastVersion>`

### Write bursts

- both project creation and append routes enforce fixed-window rate limits
- rejected requests return `429` and `Retry-After`

## Verification Commands

Core verification:

```bash
bun run typecheck
bun run test
bun run test:e2e
```

Scale verification:

```bash
bun scripts/seed-large-project.ts
# see load/README.md for append, paged load, reconnect, and fanout probes
```

## Notes

- Presence is still ephemeral and not durable.
- Auth is still demo-only.
- Redis-backed abstractions are shipped, but the automated suite still runs a single app process rather than a multi-node cluster.
