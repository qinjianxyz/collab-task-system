# Demo Runbook

## Before Recording

Run the app:

```bash
docker compose up --build
```

If `3000` is unavailable:

```bash
APP_PORT=8100 docker compose up --build
```

In a second terminal, seed both demo projects:

```bash
APP_PORT=8100 bun run seed:demo
APP_PORT=8100 TASK_COUNT=300 bun run seed:scale
```

Copy the two printed `url` values into your notes:

- realistic walkthrough URL
- benchmark walkthrough URL

Open two browser contexts, not two tabs in the same identity container:

- one normal window
- one incognito window or separate profile

Set two different display names so presence is visible.

## Recording Order

1. Open the realistic walkthrough URL.
2. Open the same URL in the second browser context.
3. Add a task, set prerequisites, and show the update in both contexts.
4. Change task status and show convergence.
5. Add a comment and point at the activity feed.
6. Use undo and redo.
7. Point at presence chips.
8. Open the root `README.md`.
9. Walk through `Architecture At A Glance`, `Why Event Sourcing Is The Right Fit`, and `Current State And Honest Tradeoffs`.
10. Open the benchmark URL and show the larger project.
11. Use `docs/architecture.md` and `docs/scaling.md` only for deeper follow-up questions.

## What To Emphasize

- no managed realtime database
- event log as the source of truth
- append plus projection in one transaction
- optimistic client apply with ordered server reconciliation
- dependency rules enforced on the write path
- separate realistic and benchmark seeds for honest demo coverage

## What Not To Waste Time On

- Docker logs
- long test output
- implementation details before showing the product
- claiming scale features that are still documented as future work

## If Something Goes Wrong

If presence does not show two viewers:

- confirm you used two browser contexts
- confirm both contexts have different display names

If the app is not reachable:

- check the selected port
- rerun `docker compose up --build`

If you need fresh demo data:

```bash
APP_PORT=8100 bun run seed:demo
APP_PORT=8100 TASK_COUNT=300 bun run seed:scale
```

Use the newly printed URLs and continue.
