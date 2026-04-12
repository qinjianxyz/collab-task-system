# Demo Runbook

Use this before you hit record.

## 1. Start The App

Default port:

```bash
docker compose up --build
```

Alternate port:

```bash
APP_PORT=8100 docker compose up --build
```

Health check:

```bash
curl http://127.0.0.1:8100/api/health
```

Use `3000` in that command if you are recording on the default port.

## 2. Seed A Large Project

In another terminal:

```bash
bun scripts/seed-large-project.ts
```

Save the returned `projectId`. You will need it for the scale segment.

## 3. Open Browser Contexts

For the collaboration demo:

- open one normal browser window
- open one incognito window or a separate browser profile

Reason:

- demo identity is stored in browser storage
- isolated contexts make presence clearer and avoid accidental identity reuse

## 4. Tabs To Keep Ready

Open these before recording:

- app root
- seeded large project URL
- [README.md](../../README.md)
- [architecture.md](../architecture.md)
- [scaling.md](../scaling.md)
- [api.md](../api.md)

## 5. Live Recording Sequence

1. show the landing page and create a project
2. open the same project in the second browser context
3. add a task, change status, and add a comment
4. show presence, activity, undo/redo, and shortcuts
5. show dependency validation
6. switch to the seeded large project and scroll
7. show README, architecture, scale proof, and API docs

## 6. Fallbacks

If presence is missing:

- confirm you are using two isolated browser contexts
- refresh both project pages once

If the app is slow to start:

- wait for `/api/health` to return `status: ok`

If the large project is not ready:

- rerun the seed script and use the newly returned `projectId`

If port `3000` is occupied:

- restart on `8100` with `APP_PORT=8100 docker compose up --build`

## 7. After Recording

Shut the stack down when you are done:

```bash
docker compose down
```
