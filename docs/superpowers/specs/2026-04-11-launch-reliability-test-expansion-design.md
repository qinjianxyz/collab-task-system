# Launch Reliability Test Expansion Design

## Goal

Expand test coverage around launch-critical behavior so the repository is harder to break in the evaluator path and safer to evolve as an OSS project.

This is not a coverage-percentage exercise. The focus is reliability for the flows that matter most:

- `docker compose up --build`
- create a project from the root page
- open two tabs and watch realtime sync converge
- recover from conflicts, disconnects, and degraded dependencies
- load large projects without rendering or paging regressions

## Why This Pass Exists

The current suite is already strong on happy-path event sourcing, realtime sync, and core UI behavior. The remaining launch risk sits in edge contracts:

- optimistic retry when versions race
- reducer/history behavior around unloaded pages and replayed events
- SSE recovery and slow-consumer handling
- Redis-backed services degrading safely
- UI surfacing of validation and connectivity failures
- project creation and large-list behavior from the actual user entry path

Those are the failures most likely to create visible demo regressions or misleading OSS claims.

## Approach Options

### Option 1: Mostly Unit Expansion

Add many fast reducer and utility tests.

Tradeoff:
- fast and cheap
- weak protection for route-layer contracts and browser behavior

### Option 2: Reliability-First Pyramid Expansion

Add a moderate number of unit tests for invariants, integration tests for API/runtime contracts, and a small number of targeted e2e regressions for the evaluator path.

Tradeoff:
- best launch-risk reduction
- slightly slower than unit-heavy expansion

### Option 3: E2E-Heavy Expansion

Push most new coverage into Playwright.

Tradeoff:
- strongest top-level user confidence
- slowest feedback
- weakest root-cause isolation

## Recommendation

Use Option 2.

That keeps the suite explainable:

- unit tests lock down local invariants
- integration tests prove server/runtime contracts
- e2e tests protect the evaluator path

## Test Architecture

### Unit Layer

Add tests where a small state bug would silently corrupt collaboration behavior:

- reducer handling for out-of-window entities, page merge ordering, delete cascades, and optimistic overlays
- history inversion for update/delete/comment edge cases
- virtual list boundary math and next-page trigger thresholds
- rate limiter, presence, and event-bus fail-open semantics
- config and health helpers

### Integration Layer

Add tests for contracts crossing storage, routes, and SSE:

- append API returns clear `422` payloads for blocked transitions
- rate-limited writes include `Retry-After`
- snapshot and task page routes preserve ordering and page metadata
- SSE stream survives degraded Redis mode and still emits local events/presence
- stream overflow path closes and recovery through `events?since=` remains valid
- health route reports degraded services correctly

### E2E Layer

Add only evaluator-visible regressions:

- create project from `/` and land on the project page
- optimistic conflict path across two tabs converges and does not strand UI state
- reconnect path after deliberate stream interruption converges
- root/project pages surface errors instead of silently stalling
- large project scrolling keeps the DOM window bounded while loading more tasks

## Error Handling Strategy

The new tests should prefer externally visible behavior over implementation details:

- route tests should assert status codes, payloads, and headers
- UI tests should assert visible status, error copy, and convergence
- SSE tests should assert emitted events and recovery behavior, not internal timers

This keeps the suite stable during refactors while still policing the real contracts.

## Success Criteria

This pass is successful when:

1. A version-race or reconnect bug is likely to fail tests before it reaches the demo.
2. Redis degradation and rate limiting are proven through public behavior, not only internal classes.
3. The root-page-to-two-tab evaluator path has direct Playwright coverage.
4. The suite remains fast enough to run routinely in CI and before release.

## Out Of Scope

- chasing arbitrary line or branch coverage targets
- snapshotting large chunks of rendered markup
- multi-node cluster orchestration in CI
- adding new product features

The goal is to harden what already exists.
