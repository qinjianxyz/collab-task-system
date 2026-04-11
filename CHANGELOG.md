# Changelog

## v0.1.0

- Event-sourced data model with an append-only log and transactional projections.
- Optimistic concurrency control with `expectedVersion` and `409` conflict detection.
- Real-time sync via SSE with Redis-backed or in-memory fan-out.
- Client-side optimistic updates with automatic `409` retry.
- Undo and redo via event inversion; client-driven and server-agnostic.
- Ephemeral presence indicators streamed over SSE with Redis-backed or in-memory stores.
- Live activity feed as a projection over the event stream.
- Task dependency DAG validation with cycle detection and blocked status transitions.
- Cursor-paged snapshots and task windows for large projects.
- Virtualized task list rendering with incremental loading.
- Bounded SSE buffers for slow-consumer protection.
- Write-path rate limiting with `429` and `Retry-After`.
- Seed and load harnesses for `10,000+` task projects.
- Zod-validated discriminated union event types shared across client and server.
- Playwright end-to-end coverage for two-tab sync, presence, undo, activity feed, dependencies, and shortcuts.
- Dockerized local stack with PostgreSQL 17, Redis 7, and health-check-gated startup.
