# Contributing

## Prerequisites

- Node 24+ or Bun 1.3+
- Docker Desktop or compatible Docker engine

## Development Setup

```bash
bun install
bun run db:up
bun run db:migrate
bun run dev
```

If `localhost:3000` is occupied, set `APP_PORT` for Docker workflows or pass a different port to `next dev`.

## Test Commands

```bash
bun run typecheck
bun run test
bun run test:e2e
```

## Pull Requests

- Keep shared types and Zod schemas in sync.
- Add or update tests for behavior changes.
- Preserve the event-sourced write path: append event and projection update in one transaction.
- Do not add direct CRUD writes that bypass the event log.
- Document any protocol or schema changes in `README.md` and `docs/architecture.md`.
