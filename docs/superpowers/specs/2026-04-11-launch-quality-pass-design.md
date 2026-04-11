# Launch Quality Pass Design

## Goal

Close the remaining evaluator-visible product gaps without expanding scope. This pass turns the app from a strong demo into a more complete collaborative task product by exposing capabilities the event model and sync layer already support.

## Constraints

- Stay within the existing product surface.
- Preserve the current event-sourced architecture, SSE sync path, and optimistic client model.
- Use the already-added red Playwright tests as the primary behavior gate.

## Approach Options

### Option 1: Keep the current demo harness and document missing actions

This is the lowest-risk path in code churn, but it leaves obvious holes in the evaluator path. It would make the README stronger while the product itself still hides supported mutations.

### Option 2: Expose the missing capabilities directly in the UI

Add a real multi-project landing page and first-class delete actions for tasks and comments. This keeps the architecture intact and makes the existing event model visible to evaluators.

### Option 3: Broaden the product with richer editing flows

Add inline task editing, comment editing, assignment controls, and richer accessibility work in one pass. This would improve completeness further, but it widens the change set and increases regression risk.

## Recommendation

Choose Option 2 for this pass.

It closes the highest-value completeness gaps with minimal architecture risk:

- the home page becomes a real multi-project entry point instead of an auto-redirect
- task and comment deletion become first-class, testable behaviors in the workspace
- existing reducers, event contracts, and sync logic remain the source of truth

## Design

### Landing Page

The server should query recent projects and render them on `/`. The landing page keeps the create-project form, but now also presents a list of existing workspaces with direct links into each project. This makes the “multiple projects” objective visible from the main entry path.

### Workspace Delete Actions

The workspace should expose:

- a task-level delete button that dispatches `task.delete`
- a comment-level delete button that dispatches `comment.delete`

These should use the existing sync hook so delete events stay optimistic, versioned, and convergent across tabs.

### UX Boundaries

This pass does not add new domain concepts. It only surfaces already-supported actions. Error handling remains driven by the existing sync hook, and any new UI should be small, direct, and evaluator-visible.

## Testing

The red-first gate for this pass is:

- landing page lists existing projects and lets the user open one
- task and comment deletion converge across two tabs

After those pass, rerun the full typecheck, unit/integration suite, and full Playwright suite to guard against regressions.
