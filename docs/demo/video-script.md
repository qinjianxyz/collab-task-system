# Video Script

Use this as the primary recording script.

## Pre-Recording Setup

Run the app before you start recording:

```bash
docker compose up --build
```

If you want the same port used on this machine:

```bash
APP_PORT=8100 docker compose up --build
```

Seed a large project in a second terminal:

```bash
bun scripts/seed-large-project.ts
```

Keep the returned `projectId` for the scale segment.

Open:

- one normal browser window
- one incognito window or separate profile

That matters because demo identity is stored in browser storage, so presence is clearer with isolated contexts.

## 0:00-0:30 Framing

On screen:

- [README.md](../../README.md)

Say:

“Collab Task System is an event-sourced collaborative task manager built with Next.js, PostgreSQL, Redis, and server-sent events. The core idea is that sync, activity, undo and redo, and collaboration all derive from one ordered event stream instead of being separate bolt-on subsystems.”

Then scroll briefly to:

- `What You'll See`
- `Architecture At A Glance`
- `Scale Proof`

Say:

“The take-home asks for real-time collaboration, consistency, and a path to large project payloads without a managed real-time database. This repo is built specifically around that.”

## 0:30-2:15 Live Collaboration Demo

On screen:

- app running in two isolated browser contexts

Actions:

1. In window one, set a display name and create a new project.
2. Open the same project in window two.
3. Add a task in window one.
4. Wait for it to appear in window two.
5. Change the task status in window two.
6. Wait for window one to update.
7. Add a comment.
8. Confirm both windows show the comment.

Say:

“Here the client applies an optimistic change immediately, posts an event to the server, and the server commits that event transactionally with the projection update. After commit, the event is broadcast over SSE so the other client converges without reloading the full project.”

Call out explicitly:

“Nothing here uses Firebase, Supabase, or a managed realtime database.”

## 2:15-3:15 Collaboration Features

On screen:

- project header
- activity feed
- task list

Actions:

1. Point at the presence chips.
2. Point at the activity feed.
3. Use `Ctrl+Z` to undo the last task change.
4. Use `Ctrl+Shift+Z` to redo it.
5. Press `?` to open shortcuts help.

Say:

“Undo and redo are normal inverse events. The server stays agnostic; it just validates and appends events. Activity is another projection over the same stream, and presence is an ephemeral SSE-backed collaboration layer.”

## 3:15-4:00 Domain Rules

Actions:

1. Create task `Fix auth`.
2. Create task `Ship dashboard`.
3. Add `Fix auth` as a dependency of `Ship dashboard`.
4. Attempt to move `Ship dashboard` to `in_progress`.
5. Show the blocked transition error.
6. Complete `Fix auth`.
7. Retry the status change successfully.

Say:

“Task dependencies are enforced on the write path. The server validates the DAG and blocks invalid status transitions transactionally, so every client stays consistent.”

If useful, add:

“That matters because this is not eventually-correct UI logic. The domain rule is enforced at the append boundary.”

## 4:00-4:35 Scale Proof

On screen:

- seeded large project using the `projectId` from the seed script

Actions:

1. Open the large project.
2. Scroll through the task list quickly.
3. Show that the UI stays responsive.
4. Optionally trigger loading the next page if it is not already visible.

Then open:

- [scaling.md](../scaling.md)

Point briefly at:

- `Scale Posture At A Glance`
- `Results Table`

Say:

“The take-home assumes projects can eventually exceed two megabytes. This system handles that by shipping paged snapshots, cursor-based task windows, virtualized rendering, and reconnect catch-up through incremental events instead of full document reloads.”

Point to the measured results and say:

“Load probes and the seed script are checked into the repo, so the scale claims are backed by runnable artifacts.”

## 4:35-5:00 Architecture And Close

Open:

- [architecture.md](../architecture.md)

Point to:

- `Architecture In One Picture`
- `Write Path`
- `Reconnect And Catch-Up`

Then say:

“The write path is: optimistic client action, `POST /events`, append plus projection in one SQL transaction, then publish the committed event to the project event bus and fan it out over SSE.”

Then briefly show:

- [api.md](../api.md)
- [README.md](../../README.md)

Say:

“Operationally, the repo is Dockerized, tested at the unit, integration, and end-to-end levels, and documented as an OSS project. The current tradeoffs are demo identity instead of full auth, ephemeral presence, and Redis-backed abstractions that are exercised in automation without a full multi-node app cluster.”

Close with:

“The important architectural difference is that collaboration, sync, and history are all projections over one event stream. That is what makes this a better fit for large, collaborative task management than a traditional CRUD design.”
