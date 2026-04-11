# Scale Proof And Polish Design

## Goal

Turn the existing collaborative task system into an OSS-reference-grade implementation by proving that the current architecture scales without broadening product scope.

The work stays inside the current surface area:

- projects
- tasks
- comments
- realtime SSE sync
- undo and redo
- presence
- activity feed

The phase focuses on making current claims true under load, then tightening evaluator-facing polish and documentation.

## Non-Goals

- no new collaboration surface such as live cursors or collaborative rich text
- no new product modules such as Kanban, analytics, or AI features
- no rewrite of the event model
- no replacement of SSE with WebSockets

## Current State

The system already has:

- append-only event log in PostgreSQL
- transactional projection updates
- optimistic concurrency via `expectedVersion`
- realtime SSE fan-out
- optimistic client sync with `409` retry
- undo and redo via event inversion
- presence and activity feed
- Docker setup and automated tests

The main gap is proof. The architecture is stronger than the current measured evidence.

## Design Principles

1. Preserve the current mental model.
   Scale improvements must extend the event-sourced design, not create side systems.

2. Keep the small-project demo simple.
   Local development should still work without Redis and without complex infrastructure.

3. Add interfaces where scale requires replaceable infrastructure.
   Redis fan-out, presence storage, and rate limiting should be abstractions with safe in-memory fallbacks.

4. Optimize for measurable claims.
   Every scale claim should map to a test, load script, or documented benchmark.

## Architecture Changes

### 1. Read Path Scaling

The current snapshot returns every task and every comment for a project. That is correct for small projects but not for large ones.

The new design adds paged loading:

- `GET /api/projects/[projectId]/snapshot`
  - returns project metadata
  - returns the current project version
  - returns only the first task window
  - returns comments for the returned task IDs
  - returns `taskCount`, `hasMoreTasks`, and `nextTaskCursor`

- `GET /api/projects/[projectId]/tasks?after=<cursor>&limit=<n>`
  - returns the next window of tasks
  - returns comments scoped to those tasks
  - uses a stable cursor based on `(position, id)`

This keeps the initial load bounded while preserving the event-sourced write path.

### 2. Client Virtualization

The client currently renders every loaded task. That will not hold for `10,000+` tasks.

The project view will be refactored to:

- keep a paged task collection
- fetch more tasks as the user approaches the end of the visible window
- render only visible rows plus overscan

This should be implemented with a small internal virtualization utility rather than adding a large dependency unless the code becomes clearly worse without one.

### 3. Realtime Fan-Out Abstraction

The current in-process event emitter is enough for single-instance demos but not for reference-grade OSS positioning.

Introduce a `ProjectEventBus` abstraction with two implementations:

- `InMemoryProjectEventBus`
- `RedisProjectEventBus`

Selection rule:

- use Redis when `REDIS_URL` is configured
- otherwise fall back to in-memory mode

This preserves the current demo path while making multi-instance fan-out real.

### 4. Presence Store Abstraction

Presence should become multi-instance in the same way as event fan-out.

Introduce a `PresenceStore` abstraction with:

- in-memory implementation
- Redis-backed implementation with TTL semantics

Behavior stays the same:

- presence is ephemeral
- presence is not persisted in Postgres
- disconnect removes presence after a short timeout

### 5. Backpressure And Rate Limits

Reference-grade realtime infrastructure needs protection against bad or slow consumers.

SSE changes:

- bounded per-connection queue
- heartbeat remains
- if the queue overflows, close the connection cleanly
- reconnect flow + `events?since=N` handles recovery

Write path changes:

- rate-limit `POST /api/projects`
- rate-limit `POST /api/projects/[projectId]/events`
- Redis-backed limiter when available
- in-memory fallback otherwise
- return `429` with `Retry-After`

This prevents a single client or traffic spike from degrading the whole demo.

## API Contract Changes

### Snapshot response

Add paging metadata:

- `taskPage.tasks`
- `taskPage.comments`
- `taskPage.nextCursor`
- `taskPage.hasMore`
- `taskPage.totalCount`

The existing snapshot shape can be kept as a compatibility layer for a short period, but the target is explicit paging metadata to avoid ambiguity.

### Task page response

Add a dedicated response schema for task windows:

- `tasks`
- `comments`
- `nextCursor`
- `hasMore`

### Stream behavior

SSE event types stay the same where possible:

- `version`
- `project-event`
- `presence`

But the stream transport gains queue protection and Redis-backed fan-out when configured.

## Testing Strategy

### Unit tests

- cursor encode/decode
- paged merge reducer behavior
- virtualization window calculations
- rate limiter logic
- backpressure queue behavior
- Redis and in-memory interface parity where feasible

### Integration tests

- paged snapshot correctness
- task page ordering and pagination
- Redis bus publish/subscribe
- Redis presence updates
- rate-limit responses
- slow-consumer disconnect and reconnect recovery

### End-to-end tests

- large seeded project loads the first task window
- scrolling or explicit page fetch loads more tasks
- two-tab sync still converges with paged state
- presence, activity, and undo remain correct in paged mode

## Load Proof

Add:

- seed script for large projects
- `k6` scripts for:
  - append throughput
  - SSE fan-out
  - reconnect pressure
  - paged initial load

Document measured results in `docs/scaling.md`.

## Documentation Changes

After scale proof lands:

- update `README.md`
- update `docs/architecture.md`
- add `docs/scaling.md`
- add `docs/operations.md`
- optionally add `docs/demo-script.md`

The docs should separate:

- what is shipped now
- what falls back locally
- how Redis changes deployment behavior
- what the measured limits were on the reference machine

## Risks And Mitigations

### Risk: paged sync complicates client correctness

Mitigation:

- keep one canonical reducer for committed events
- treat unloaded tasks as version-only updates unless they enter a loaded window
- add reducer tests before client refactor

### Risk: Redis support makes local setup heavier

Mitigation:

- keep Redis optional
- local demo remains functional without it
- Docker Compose gets a Redis profile or default service only if it stays simple

### Risk: virtualization harms the evaluator demo

Mitigation:

- preserve the current UX for small lists
- keep row rendering stable
- add e2e coverage for the core two-tab flow after the virtualized refactor

## Success Criteria

The phase is complete when:

- the app can handle a seeded project with `10,000+` tasks using paged loading and virtualization
- realtime fan-out can run through Redis
- rate limiting and SSE backpressure protections are in place
- load tests and measured results are documented
- the evaluator-facing docs reflect shipped behavior, not aspirational behavior
