# Launch Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the remaining evaluator-visible capabilities already supported by the event model and sync layer, then re-verify the full launch path.

**Architecture:** Keep the event store, reducers, and sync hook unchanged where possible. Add a server-side project catalog for the landing page and small UI controls that dispatch existing delete events through the same optimistic event path.

**Tech Stack:** Next.js App Router, React client components, TypeScript strict, Playwright, Vitest

---

## Chunk 1: Multi-Project Landing Page

### Task 1: Add a project catalog read path

**Files:**
- Modify: `src/server/projects/catalog.ts`
- Test: `test/e2e/two-tab-sync.spec.ts`

- [ ] **Step 1: Use the failing e2e as the red test**

Run: `PLAYWRIGHT_PORT=3101 PLAYWRIGHT_USE_EXISTING_SERVER=1 mise exec node@22 -- bunx playwright test test/e2e/two-tab-sync.spec.ts --grep 'landing page lists existing projects'`

Expected: FAIL because `/` does not render a project list.

- [ ] **Step 2: Implement a recent-project catalog query**

Add a read helper that returns recent projects with enough metadata for the landing page.

- [ ] **Step 3: Verify the e2e turns green**

Run the same Playwright command and confirm PASS.

### Task 2: Render the landing page as a real multi-project entry point

**Files:**
- Modify: `app/page.tsx`
- Modify: `src/client/components/create-project-page.tsx`
- Modify: `app/globals.css`
- Test: `test/e2e/two-tab-sync.spec.ts`

- [ ] **Step 1: Keep the create-project form and add recent project cards**
- [ ] **Step 2: Add direct links into existing workspaces**
- [ ] **Step 3: Re-run the landing-page e2e and confirm PASS**

## Chunk 2: Delete Flows

### Task 3: Expose task and comment delete actions

**Files:**
- Modify: `src/client/components/project-workspace.tsx`
- Modify: `app/globals.css`
- Test: `test/e2e/two-tab-sync.spec.ts`

- [ ] **Step 1: Use the failing deletion e2e as the red test**

Run: `PLAYWRIGHT_PORT=3101 PLAYWRIGHT_USE_EXISTING_SERVER=1 mise exec node@22 -- bunx playwright test test/e2e/two-tab-sync.spec.ts --grep 'task and comment deletion converge'`

Expected: FAIL because the workspace does not expose delete controls.

- [ ] **Step 2: Add delete controls that dispatch existing `task.delete` and `comment.delete` events**
- [ ] **Step 3: Re-run the focused e2e and confirm PASS**

## Chunk 3: Regression Verification

### Task 4: Run full verification and fix regressions

**Files:**
- Modify: any files required by regressions discovered during verification

- [ ] **Step 1: Run `mise exec node@22 -- bun run typecheck`**
- [ ] **Step 2: Run `mise exec node@22 -- bun run test`**
- [ ] **Step 3: Run `mise exec node@22 -- bun run test:e2e`**
- [ ] **Step 4: Fix any failures and rerun until green**

Plan complete and saved to `docs/superpowers/plans/2026-04-11-launch-quality-pass.md`. Ready to execute.
