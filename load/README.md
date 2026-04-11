# Load Harness

These scripts prove the scale path against the real app, not mocked helpers.

## Prerequisites

- Docker Desktop or a local PostgreSQL + Redis matching `docker-compose.yml`
- App running with `DATABASE_URL` and `REDIS_URL`
- `k6` binary, or the `grafana/k6` Docker image for the HTTP scenarios

## Seed a large project

```bash
bun scripts/seed-large-project.ts
# => {"projectId":"...","taskCount":10000,"durationMs":...}
```

Override the size with `TASK_COUNT=15000`.

## HTTP scenarios (k6)

If `k6` is installed locally:

```bash
k6 run -e BASE_URL=http://127.0.0.1:3000 load/append-throughput.js
k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROJECT_ID=<seeded-project-id> load/paged-initial-load.js
k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROJECT_ID=<seeded-project-id> load/reconnect-pressure.js
```

If you only have Docker Desktop:

```bash
docker run --rm -i \
  -e BASE_URL=http://host.docker.internal:3000 \
  -v "$PWD/load:/scripts" \
  grafana/k6 run /scripts/append-throughput.js
```

Swap the script path and add `-e PROJECT_ID=...` for the paged and reconnect scenarios.

## SSE fanout probe

`load/realtime-fanout.js` is a Node 22 probe because vanilla `k6` does not ship a native SSE client.

```bash
node load/realtime-fanout.js
```

Useful env overrides:

- `BASE_URL=http://127.0.0.1:3000`
- `LISTENERS=50`
- `EVENT_COUNT=10`
