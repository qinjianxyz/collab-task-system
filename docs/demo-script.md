# Demo Script

Use this for the five-minute evaluator walkthrough.

## 1. Setup And Framing

- Show `docker compose up --build`.
- State the thesis: this is event-sourced collaborative task management, not CRUD with realtime bolted on.
- Mention the stack: Next.js App Router, PostgreSQL, Redis, SSE.

## 2. Two-Tab Demo

- Open `localhost:3000` in two tabs.
- Create a project in tab one.
- Open the same project in tab two.
- Add a task in tab one and show it appear in tab two.
- Change task status in tab two and show tab one converge.
- Add a comment and show both tabs update.

## 3. Collaboration Features

- Show presence chips in the header.
- Show the live activity feed.
- Trigger `Ctrl+Z` and `Ctrl+Shift+Z` to demonstrate undo and redo.
- Press `?` to show keyboard shortcuts.

## 4. Domain Rules And Scale

- Show a task with dependencies.
- Attempt a blocked status transition and show the UI error.
- Scroll through a large project to show virtualized rendering and incremental task loading.
- Mention the measured scale proof in `docs/scaling.md`.

## 5. Architecture Walkthrough

- Open `docs/architecture.md`.
- Explain the write path:
  1. client applies optimistically
  2. `POST /api/projects/{projectId}/events`
  3. append event + projection update in one SQL transaction
  4. publish committed event
  5. SSE fanout to all clients
- Explain the reconnect path: snapshot once, then `events?since=N`.
- Explain the scale posture: paged snapshots, cursor windows, Redis-backed fanout, bounded SSE queues, and rate limiting.

## 6. Close

- Point to `README.md`, `docs/api.md`, `docs/operations.md`, and `docs/scaling.md`.
- State the current tradeoffs:
  - demo identity, no real auth
  - single app instance exercised in automation even though Redis-backed abstractions are shipped
  - presence is ephemeral
