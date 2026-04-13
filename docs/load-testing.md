# Load Testing

These probes are intentionally lightweight. They are not meant to replace a full multi-node benchmark harness. They exist to show that the current read and write paths can be measured locally and that the scale claims in this repository are backed by concrete scripts.

## Scripts

```bash
bun run load:append
bun run load:task-page
```

Environment variables:

- `BASE_URL`
  - default `http://127.0.0.1:3000`
- `ITERATIONS`
  - append probe request count
- `TASK_COUNT`
  - size of the synthetic benchmark project for paged reads
- `PAGE_LIMIT`
  - task page size for the read probe
- `REPETITIONS`
  - repeated page fetch count per probe

## What They Measure

### Append Probe

`load/append-events.ts`:

- creates a project
- appends a sequence of `task.create` events through the public API
- records end-to-end request latency for each append

This exercises:

- route validation
- optimistic concurrency checks
- event insert
- projection update

### Paged Read Probe

`load/task-page.ts`:

- seeds a synthetic scale project
- measures repeated first-page reads
- measures repeated follow-up page reads with a real cursor

This exercises:

- ordered `(position, id)` paging
- comment scoping to the visible task window
- the route that the virtualized UI consumes for large projects

## Local Results

Environment:

- single local Next.js production server
- local Postgres
- no Redis fan-out
- no network hop beyond loopback

Command:

```bash
BASE_URL=http://127.0.0.1:3012 ITERATIONS=30 bun run load:append
BASE_URL=http://127.0.0.1:3012 TASK_COUNT=128 PAGE_LIMIT=32 REPETITIONS=6 bun run load:task-page
```

Results captured on April 12, 2026:

| Probe | Average | P95 | Min | Max |
| --- | ---: | ---: | ---: | ---: |
| Append `task.create` x30 | 43.46 ms | 88.77 ms | 20.40 ms | 143.15 ms |
| First task page `limit=32` x6 | 29.75 ms | 62.82 ms | 19.14 ms | 62.82 ms |
| Follow-up task page x6 | 18.28 ms | 22.38 ms | 16.06 ms | 22.38 ms |

Large-seed proof captured on April 12, 2026:

| Seed / Probe | Result |
| --- | --- |
| `TASK_COUNT=10000 bun run seed:scale` | completed successfully in `210.34s` |
| `TASK_COUNT=30000 bun run seed:scale` | completed successfully in `750.71s` |
| `30,000` task first page `limit=32` x6 | average `24.63 ms`, p95 `75.43 ms`, min `13.19 ms`, max `75.43 ms` |
| `30,000` task follow-up page x6 | average `13.97 ms`, p95 `17.31 ms`, min `12.44 ms`, max `17.31 ms` |

For a heavier manual benchmark run, increase the seed size directly:

```bash
BASE_URL=http://127.0.0.1:3000 TASK_COUNT=10000 PAGE_LIMIT=32 REPETITIONS=6 bun run load:task-page
```

## Reading The Numbers Honestly

What these numbers do show:

- the write path remains comfortably sub-100ms on a local single-node baseline
- paged reads are materially cheaper than shipping the full project state
- follow-up page fetches stay cheap once the project is seeded
- the same cursor-paged read path remains practical even at `30,000` tasks

What they do not show:

- multi-instance fan-out under shared Redis
- browser rendering costs at internet-scale data sizes
- long-running soak behavior
- cross-region latency

Those are the next operational benchmarks, not claims already being made here.
