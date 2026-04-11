# Launch Reliability Test Expansion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand automated tests around launch-critical failure and recovery paths so the evaluator flow and OSS runtime contracts are harder to break.

**Architecture:** Add targeted tests at three layers. Unit tests lock down reducer/history/runtime invariants, integration tests prove route and SSE contracts, and e2e tests cover the root-to-two-tab evaluator path and reconnect/conflict scenarios. Keep assertions on public behavior, not implementation details.

**Tech Stack:** Vitest, Playwright, Next.js App Router routes, PostgreSQL, Redis, SSE, TypeScript

---

## Chunk 1: Reducer And Client-State Reliability

### Task 1: Expand reducer invariants

**Files:**
- Modify: `test/unit/project-sync-reducer.test.ts`
- Reference: `src/client/sync/reducer.ts`

- [ ] **Step 1: Write failing tests**
  - add a test that `task.delete` removes loaded comments for that task
  - add a test that `mergeTaskPage` preserves sorted order when the incoming page is out of insertion order
  - add a test that a newly loaded page does not duplicate an already loaded task
  - add a test that `task.create` inside a loaded window increments `totalCount` once

- [ ] **Step 2: Run the focused reducer tests to verify failure**

Run: `mise exec node@22 -- bunx vitest run test/unit/project-sync-reducer.test.ts`

- [ ] **Step 3: Write minimal implementation changes if any test exposes a real bug**

- [ ] **Step 4: Re-run the focused reducer tests**

Run: `mise exec node@22 -- bunx vitest run test/unit/project-sync-reducer.test.ts`

- [ ] **Step 5: Commit**

```bash
git add test/unit/project-sync-reducer.test.ts src/client/sync/reducer.ts
git commit -m "test: harden reducer invariants"
```

### Task 2: Expand undo/redo history edge coverage

**Files:**
- Modify: `test/unit/history.test.ts`
- Reference: `src/client/sync/history.ts`

- [ ] **Step 1: Write failing tests**
  - add a test for `task.delete` creating recreate/delete inverse pairs from loaded snapshot state
  - add a test for `comment.update` preserving previous content
  - add a test for `comment.delete` recreating the deleted comment when loaded

- [ ] **Step 2: Run the focused history tests to verify failure**

Run: `mise exec node@22 -- bunx vitest run test/unit/history.test.ts`

- [ ] **Step 3: Write minimal implementation changes if needed**

- [ ] **Step 4: Re-run the focused history tests**

Run: `mise exec node@22 -- bunx vitest run test/unit/history.test.ts`

- [ ] **Step 5: Commit**

```bash
git add test/unit/history.test.ts src/client/sync/history.ts
git commit -m "test: cover undo and redo edge cases"
```

## Chunk 2: Route And SSE Contract Hardening

### Task 3: Add API contract tests for rate limits and validation payloads

**Files:**
- Modify: `test/integration/api-routes.test.ts`
- Reference: `app/api/projects/route.ts`
- Reference: `app/api/projects/[projectId]/events/route.ts`

- [ ] **Step 1: Write failing tests**
  - add a test that exhausted write limits return `429` with `Retry-After`
  - add a test that blocked dependency transitions return `422` and include dependency-specific error text
  - add a test that snapshot paging metadata is stable across repeated reads

- [ ] **Step 2: Run the focused API route tests to verify failure**

Run: `mise exec node@22 -- bunx vitest run test/integration/api-routes.test.ts`

- [ ] **Step 3: Write minimal implementation changes if needed**

- [ ] **Step 4: Re-run the focused API route tests**

Run: `mise exec node@22 -- bunx vitest run test/integration/api-routes.test.ts`

- [ ] **Step 5: Commit**

```bash
git add test/integration/api-routes.test.ts app/api/projects/route.ts app/api/projects/[projectId]/events/route.ts
git commit -m "test: harden api reliability contracts"
```

### Task 4: Add SSE degradation and recovery tests

**Files:**
- Modify: `test/integration/sse-stream.test.ts`
- Reference: `app/api/projects/[projectId]/stream/route.ts`
- Reference: `src/server/realtime/event-bus.ts`
- Reference: `src/server/realtime/presence.ts`

- [ ] **Step 1: Write failing tests**
  - add a test that stream connection still initializes when presence store fails open
  - add a test that local stream delivery still works when Redis event bus throws during publish after subscribe
  - add a test that a stream closed by bounded buffering can still recover through `events?since=`

- [ ] **Step 2: Run the focused SSE tests to verify failure**

Run: `mise exec node@22 -- bunx vitest run test/integration/sse-stream.test.ts`

- [ ] **Step 3: Write minimal implementation changes if needed**

- [ ] **Step 4: Re-run the focused SSE tests**

Run: `mise exec node@22 -- bunx vitest run test/integration/sse-stream.test.ts`

- [ ] **Step 5: Commit**

```bash
git add test/integration/sse-stream.test.ts app/api/projects/[projectId]/stream/route.ts src/server/realtime/event-bus.ts src/server/realtime/presence.ts
git commit -m "test: harden sse recovery and degraded runtime behavior"
```

## Chunk 3: Evaluator-Path Browser Coverage

### Task 5: Add root entry and conflict/reconnect browser regressions

**Files:**
- Modify: `test/e2e/two-tab-sync.spec.ts`
- Reference: `app/page.tsx`
- Reference: `src/client/components/create-project-page.tsx`
- Reference: `src/client/hooks/useProjectSync.ts`

- [ ] **Step 1: Write failing tests**
  - add a test that creates a project from `/` and lands on the project workspace
  - add a test that two tabs racing on the same task converge after one client hits a version conflict
  - add a test that a forced stream interruption is followed by visible reconnection and consistent task state

- [ ] **Step 2: Run the focused e2e tests to verify failure**

Run: `mise exec node@22 -- bunx playwright test test/e2e/two-tab-sync.spec.ts`

- [ ] **Step 3: Write minimal implementation changes if needed**

- [ ] **Step 4: Re-run the focused e2e tests**

Run: `mise exec node@22 -- bunx playwright test test/e2e/two-tab-sync.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add test/e2e/two-tab-sync.spec.ts app/page.tsx src/client/components/create-project-page.tsx src/client/hooks/useProjectSync.ts
git commit -m "test: cover root entry and sync recovery flows"
```

### Task 6: Final verification and docs touch-up

**Files:**
- Modify if needed: `README.md`
- Modify if needed: `docs/release-checklist.md`

- [ ] **Step 1: Run the full reliability matrix**

Run:

```bash
mise exec node@22 -- bun run typecheck
mise exec node@22 -- bun run test
mise exec node@22 -- bun run test:e2e
APP_PORT=3101 docker compose up --build -d
PLAYWRIGHT_USE_EXISTING_SERVER=1 PLAYWRIGHT_PORT=3101 mise exec node@22 -- bunx playwright test test/e2e/two-tab-sync.spec.ts
```

- [ ] **Step 2: Update docs only if verification behavior changed**

- [ ] **Step 3: Commit**

```bash
git add README.md docs/release-checklist.md test
git commit -m "test: finish launch reliability expansion"
```
