# Demo Runbook

## Start The App

```bash
docker compose up --build
```

If `3000` is occupied:

```bash
APP_PORT=8100 docker compose up --build
```

## Seed The Two Demo Projects

```bash
APP_PORT=8100 bun run seed:demo
APP_PORT=8100 TASK_COUNT=300 bun run seed:scale

# optional heavier scale proof
APP_PORT=8100 TASK_COUNT=10000 bun run seed:scale

# OSS-reference-grade stress proof
APP_PORT=8100 TASK_COUNT=30000 bun run seed:scale
```

Record the two returned URLs:

- realistic walkthrough URL
- scale benchmark URL

## Recording Setup

- use two browser contexts, not two tabs in one profile
- set different display names so presence is visible
- keep [README.md](../../README.md), [architecture.md](../architecture.md), and [scaling.md](../scaling.md) ready for the Q&A portion

## Recording Order

1. Open the realistic walkthrough URL in two browser contexts.
2. Show presence chips with two names.
3. Add a task.
4. Use `Blocked by` to pick a prerequisite.
5. Show the new task appear in the second browser context.
6. Change status in the second browser context and show the first one converge.
7. Focus a comment box in one browser context and point out the live cursor badge in the other.
8. Add a comment with `@alice` or `@bob`, then show the notification panel update.
9. Edit the task description in one browser context and show the collaborative description textarea update in the other.
10. Add a comment, then edit it, then delete it.
11. Delete a task.
12. Trigger a blocked transition and show the explicit validation error.
13. Use undo and redo.
14. Switch to Board view and drag a card into another status column.
11. Open `README.md` and walk through:
    - What You Can Do
    - Architecture At A Glance
    - Why Event Sourcing Instead Of CRUD
    - How The 2MB Constraint Is Handled
15. Open the scale benchmark URL.
16. Show the first task window, then scroll to load more.
17. Point out that the benchmark view uses cursor-paged reads and virtualized rendering.
18. Use `docs/architecture.md` and `docs/scaling.md` only for follow-up questions.

## What To Emphasize

- no managed realtime database
- event log as the source of truth
- append + projection in one transaction
- optimistic UI with ordered server reconciliation
- live cursor and collaborative description layers stay outside the durable log
- board drag-and-drop still writes normal `task.update` events
- domain rules enforced on the write path
- paged reads and virtualized rendering for larger task sets

## What Not To Waste Time On

- Docker logs
- long test output
- file-by-file code browsing before showing behavior
- claiming distributed scale features that are not shipped

## Recovery Steps

If presence is missing:

- verify two browser contexts are open
- verify each has a different display name

If the app is unreachable:

- verify the chosen port
- rerun `docker compose up --build`

If you need fresh URLs:

```bash
APP_PORT=8100 bun run seed:demo
APP_PORT=8100 TASK_COUNT=300 bun run seed:scale
```
