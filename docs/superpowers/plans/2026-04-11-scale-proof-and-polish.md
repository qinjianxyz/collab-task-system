# Scale Proof And Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that the existing event-sourced collaborative task system scales on read, realtime, and write paths, then tighten evaluator-facing polish and documentation.

**Architecture:** This phase keeps the current event model and sync protocol intact while adding paged task loading, virtualized rendering, Redis-backed realtime abstractions, and protective controls such as rate limiting and SSE backpressure. The final output is measured proof plus updated documentation, not new product modules.

**Tech Stack:** Next.js 16 App Router, TypeScript, PostgreSQL 17, Redis, SSE, Vitest, Playwright, k6, Docker Compose

---

## Chunk 1: Read Path Scale

### Task 1: Define paged task contracts

**Files:**
- Modify: `src/shared/api.ts`
- Modify: `src/shared/types.ts`
- Test: `test/unit/types.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Add tests for:
- task page cursor schema
- paged snapshot response schema
- task page response schema

- [ ] **Step 2: Run the targeted schema tests**

Run: `bunx vitest run test/unit/types.test.ts`
Expected: FAIL on missing schemas or wrong shapes

- [ ] **Step 3: Implement minimal shared schemas**

Add:
- task cursor schema
- paged task window schema
- task page response schema
- updated snapshot response schema with paging metadata

- [ ] **Step 4: Re-run the targeted schema tests**

Run: `bunx vitest run test/unit/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/api.ts src/shared/types.ts test/unit/types.test.ts
git commit -m "feat: add paged task API contracts"
```

### Task 2: Implement server-side task pagination

**Files:**
- Modify: `src/server/events/snapshot.ts`
- Modify: `src/server/events/event-store.ts`
- Modify: `app/api/projects/[projectId]/snapshot/route.ts`
- Create: `app/api/projects/[projectId]/tasks/route.ts`
- Test: `test/integration/api-routes.test.ts`
- Test: `test/unit/snapshot.test.ts`

- [ ] **Step 1: Write failing tests for paged snapshot and task window API**

Cover:
- first page ordering by `(position, id)`
- correct comments scoping
- stable `nextCursor`
- `hasMore` and `totalCount`

- [ ] **Step 2: Run the targeted tests**

Run: `bunx vitest run test/unit/snapshot.test.ts test/integration/api-routes.test.ts`
Expected: FAIL on missing route or wrong pagination behavior

- [ ] **Step 3: Implement cursor helpers and paged queries**

Use a stable cursor over:
- `position`
- `id`

Return bounded task windows and only comments for loaded tasks.

- [ ] **Step 4: Re-run the targeted tests**

Run: `bunx vitest run test/unit/snapshot.test.ts test/integration/api-routes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/events/snapshot.ts src/server/events/event-store.ts app/api/projects/[projectId]/snapshot/route.ts app/api/projects/[projectId]/tasks/route.ts test/unit/snapshot.test.ts test/integration/api-routes.test.ts
git commit -m "feat: add paged task snapshot and task window API"
```

### Task 3: Refactor client sync state for paged task windows

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/client/hooks/useProjectSync.ts`
- Modify: `src/client/sync/reducer.ts`
- Modify: `src/client/sync/history.ts`
- Test: `test/unit/project-sync-reducer.test.ts`
- Test: `test/unit/history.test.ts`

- [ ] **Step 1: Write failing reducer and hook-adjacent tests**

Cover:
- merging a next task page
- applying events to loaded tasks
- ignoring unloaded entity payloads while still advancing version
- undo safety with paged state

- [ ] **Step 2: Run the targeted tests**

Run: `bunx vitest run test/unit/project-sync-reducer.test.ts test/unit/history.test.ts`
Expected: FAIL on missing paged-state behavior

- [ ] **Step 3: Implement paged state transitions**

Keep:
- optimistic mutation model
- conflict retry model
- activity and presence behavior

Add:
- task window merge logic
- loaded-task awareness

- [ ] **Step 4: Re-run the targeted tests**

Run: `bunx vitest run test/unit/project-sync-reducer.test.ts test/unit/history.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/api.ts src/client/hooks/useProjectSync.ts src/client/sync/reducer.ts src/client/sync/history.ts test/unit/project-sync-reducer.test.ts test/unit/history.test.ts
git commit -m "feat: support paged task state in project sync"
```

### Task 4: Add task list virtualization and incremental loading

**Files:**
- Modify: `src/client/components/project-workspace.tsx`
- Modify: `app/globals.css`
- Create: `src/client/components/virtual-task-list.tsx`
- Test: `test/unit/workspace-smoke.test.ts`
- Test: `test/e2e/two-tab-sync.spec.ts`

- [ ] **Step 1: Write failing UI tests**

Cover:
- large task list initial render stays bounded
- next page loads when requested or scrolled near boundary
- current two-tab demo still works

- [ ] **Step 2: Run the targeted tests**

Run: `bunx vitest run test/unit/workspace-smoke.test.ts && PLAYWRIGHT_USE_EXISTING_SERVER=1 PLAYWRIGHT_PORT=3010 bunx playwright test test/e2e/two-tab-sync.spec.ts`
Expected: FAIL on missing pagination/virtualization behavior

- [ ] **Step 3: Implement the virtual task list**

Requirements:
- preserve current card rendering
- keep small-list behavior simple
- support fetch-more path cleanly

- [ ] **Step 4: Re-run the targeted tests**

Run: `bunx vitest run test/unit/workspace-smoke.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/project-workspace.tsx src/client/components/virtual-task-list.tsx app/globals.css test/unit/workspace-smoke.test.ts test/e2e/two-tab-sync.spec.ts
git commit -m "feat: virtualize and page the task list"
```

## Chunk 2: Realtime And Protection

### Task 5: Introduce event bus abstraction

**Files:**
- Modify: `src/server/realtime/project-stream.ts`
- Create: `src/server/realtime/event-bus.ts`
- Create: `src/server/realtime/in-memory-event-bus.ts`
- Create: `src/server/realtime/redis-event-bus.ts`
- Test: `test/integration/sse-stream.test.ts`

- [ ] **Step 1: Write failing tests for abstraction parity**

Cover:
- publish/subscribe semantics
- in-memory fallback
- environment-based selection

- [ ] **Step 2: Run the targeted tests**

Run: `bunx vitest run test/integration/sse-stream.test.ts`
Expected: FAIL on missing abstraction behavior

- [ ] **Step 3: Implement the bus interface and wire the selector**

Use Redis only when configured; otherwise preserve current behavior.

- [ ] **Step 4: Re-run the targeted tests**

Run: `bunx vitest run test/integration/sse-stream.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/realtime/project-stream.ts src/server/realtime/event-bus.ts src/server/realtime/in-memory-event-bus.ts src/server/realtime/redis-event-bus.ts test/integration/sse-stream.test.ts
git commit -m "feat: add pluggable project event bus"
```

### Task 6: Add presence store abstraction with Redis support

**Files:**
- Modify: `src/server/realtime/presence.ts`
- Modify: `app/api/projects/[projectId]/stream/route.ts`
- Test: `test/unit/presence.test.ts`
- Test: `test/integration/sse-stream.test.ts`

- [ ] **Step 1: Write failing presence abstraction tests**

Cover:
- viewer upsert
- disconnect TTL
- store selection
- Redis-backed semantics where testable

- [ ] **Step 2: Run the targeted tests**

Run: `bunx vitest run test/unit/presence.test.ts test/integration/sse-stream.test.ts`
Expected: FAIL on missing abstraction behavior

- [ ] **Step 3: Implement the presence interface**

Keep presence ephemeral and SSE-driven.

- [ ] **Step 4: Re-run the targeted tests**

Run: `bunx vitest run test/unit/presence.test.ts test/integration/sse-stream.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/realtime/presence.ts app/api/projects/[projectId]/stream/route.ts test/unit/presence.test.ts test/integration/sse-stream.test.ts
git commit -m "feat: add pluggable presence store"
```

### Task 7: Add SSE backpressure controls

**Files:**
- Modify: `app/api/projects/[projectId]/stream/route.ts`
- Create: `src/server/realtime/stream-buffer.ts`
- Test: `test/integration/sse-stream.test.ts`
- Test: `test/unit/stream-buffer.test.ts`

- [ ] **Step 1: Write failing backpressure tests**

Cover:
- bounded queue behavior
- slow-consumer overflow handling
- clean disconnect semantics

- [ ] **Step 2: Run the targeted tests**

Run: `bunx vitest run test/unit/stream-buffer.test.ts test/integration/sse-stream.test.ts`
Expected: FAIL on missing queue protection

- [ ] **Step 3: Implement bounded stream buffering**

When the queue overflows, close the stream and rely on client reconnect + event backfill.

- [ ] **Step 4: Re-run the targeted tests**

Run: `bunx vitest run test/unit/stream-buffer.test.ts test/integration/sse-stream.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/projects/[projectId]/stream/route.ts src/server/realtime/stream-buffer.ts test/unit/stream-buffer.test.ts test/integration/sse-stream.test.ts
git commit -m "feat: protect SSE streams with bounded buffers"
```

### Task 8: Add write-path rate limiting

**Files:**
- Create: `src/server/realtime/rate-limiter.ts`
- Modify: `app/api/projects/route.ts`
- Modify: `app/api/projects/[projectId]/events/route.ts`
- Test: `test/integration/api-routes.test.ts`
- Test: `test/unit/rate-limiter.test.ts`

- [ ] **Step 1: Write failing rate-limit tests**

Cover:
- in-memory fallback limiter
- Redis-backed path selection
- `429` response with `Retry-After`

- [ ] **Step 2: Run the targeted tests**

Run: `bunx vitest run test/unit/rate-limiter.test.ts test/integration/api-routes.test.ts`
Expected: FAIL on missing rate limiting

- [ ] **Step 3: Implement the limiter and route guards**

Preserve the current success path under normal demo load.

- [ ] **Step 4: Re-run the targeted tests**

Run: `bunx vitest run test/unit/rate-limiter.test.ts test/integration/api-routes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/realtime/rate-limiter.ts app/api/projects/route.ts app/api/projects/[projectId]/events/route.ts test/unit/rate-limiter.test.ts test/integration/api-routes.test.ts
git commit -m "feat: add write-path rate limiting"
```

## Chunk 3: Proof And Submission Polish

### Task 9: Add large-project seeding and load scripts

**Files:**
- Create: `scripts/seed-large-project.ts`
- Create: `load/append-throughput.js`
- Create: `load/realtime-fanout.js`
- Create: `load/reconnect-pressure.js`
- Create: `load/README.md`

- [ ] **Step 1: Write the seed and load scenarios**

Seed:
- one project with `10,000+` tasks

Load:
- append throughput
- SSE fan-out
- reconnect pressure

- [ ] **Step 2: Run the seed script locally**

Run: `bun scripts/seed-large-project.ts`
Expected: seeded project id output

- [ ] **Step 3: Run baseline load scenarios**

Run:
- `k6 run load/append-throughput.js`
- `k6 run load/realtime-fanout.js`
- `k6 run load/reconnect-pressure.js`

Expected: results captured for documentation

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-large-project.ts load/append-throughput.js load/realtime-fanout.js load/reconnect-pressure.js load/README.md
git commit -m "feat: add scale seed and load scenarios"
```

### Task 10: Update evaluator and OSS docs

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Create: `docs/scaling.md`
- Create: `docs/operations.md`
- Modify: `CONTRIBUTING.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update docs to reflect shipped scale features**

Include:
- pagination
- virtualization
- Redis bus and presence
- rate limiting
- backpressure
- measured load results

- [ ] **Step 2: Verify docs against implementation**

Run:
- `rg -n "future|todo|next step" README.md docs`

Expected: docs distinguish shipped behavior from future work clearly

- [ ] **Step 3: Commit**

```bash
git add README.md docs/architecture.md docs/scaling.md docs/operations.md CONTRIBUTING.md CHANGELOG.md
git commit -m "docs: publish scaling proof and operations guidance"
```

### Task 11: Final verification

**Files:**
- Modify as needed from any failures

- [ ] **Step 1: Run full verification**

Run:
- `bun run typecheck`
- `bun run test`
- `bun run test:e2e`
- `docker compose up --build`

Expected:
- all tests pass
- app starts cleanly

- [ ] **Step 2: Run compose-hosted browser verification**

Run:
- `PLAYWRIGHT_USE_EXISTING_SERVER=1 PLAYWRIGHT_PORT=<host-port> bunx playwright test test/e2e/two-tab-sync.spec.ts`

Expected:
- all e2e tests pass against the compose-hosted app

- [ ] **Step 3: Commit any final fixes**

```bash
git add .
git commit -m "chore: finalize scale proof and submission polish"
```
