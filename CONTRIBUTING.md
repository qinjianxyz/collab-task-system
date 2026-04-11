# Contributing

## Prerequisites

- Node 22+ or Bun 1.3+
- Docker Desktop or compatible Docker engine
- `mise` is optional, but the repo includes `.mise.toml` to pin Node and Bun

## Development Setup

```bash
bun install
bun run db:up
bun run db:migrate
bun run dev
```

`bun run db:up` now waits for PostgreSQL and Redis health before returning.

If `localhost:3000` is occupied, set `APP_PORT` for Docker workflows or pass a different port to `next dev`.

## Branch And PR Flow

- Create a focused branch for each change.
- Keep commits reviewable and scope-limited.
- Open a PR with verification evidence, not just a summary.

## Test Commands

```bash
bun run typecheck
bun run test
bun run test:e2e
bun run load:seed
```

- `bun run test` bootstraps PostgreSQL and Redis automatically.
- `bun run test:e2e` bootstraps PostgreSQL and Redis automatically and installs Chromium, plus Linux browser dependencies when needed.

Before opening a PR for runtime or protocol changes:

- run `docker compose up --build`
- verify the two-tab demo still converges
- update docs for API, sync, scaling, or ops changes

## Pull Requests

- Keep shared types and Zod schemas in sync.
- Add or update tests for behavior changes.
- Preserve the event-sourced write path: append event and projection update in one transaction.
- Do not add direct CRUD writes that bypass the event log.
- Document protocol, scaling, or operations changes in `README.md`, `docs/architecture.md`, `docs/scaling.md`, and `docs/operations.md`.
