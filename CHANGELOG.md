# Changelog

## v0.1.0

- Event-sourced data model with an append-only log and transactional projections.
- Optimistic concurrency control with `expectedVersion` and `409` conflict detection.
- Real-time sync via SSE with in-process fan-out.
- Client-side optimistic updates with automatic `409` retry.
- Undo and redo via event inversion; client-driven and server-agnostic.
- Ephemeral presence indicators streamed over SSE.
- Live activity feed as a projection over the event stream.
- Task dependency DAG validation with cycle detection and blocked status transitions.
- Zod-validated discriminated union event types shared across client and server.
- Playwright end-to-end coverage for two-tab sync, presence, undo, activity feed, dependencies, and shortcuts.
- Dockerized local stack with PostgreSQL 17 and health-check-gated startup.
