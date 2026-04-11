# API Reference

The full contract lives in [openapi.yaml](./openapi.yaml).

This page is the quick operator/developer summary.

## Endpoints

### `GET /api/health`

Readiness endpoint for app, database, and Redis reachability.

- `200`: app is healthy
- `503`: one or more critical dependencies failed

### `POST /api/projects`

Creates a project by appending a `project.create` event.

Required fields:

- `name`
- `clientId`
- `userId`

Response:

- `201` with `projectId` and the committed event

### `GET /api/projects/{projectId}/snapshot`

Returns the current project projection plus the first task page.

Query params:

- `taskLimit` optional, default `100`, max `250`

Response:

- project metadata
- current version
- `tasks` and `comments` for the loaded page
- `taskPage` metadata with `nextCursor`, `hasMore`, and `totalCount`

### `GET /api/projects/{projectId}/tasks`

Fetches the next task page.

Query params:

- `after` cursor returned by the previous page
- `limit` optional, default `100`, max `250`

### `GET /api/projects/{projectId}/events`

Fetches ordered events after a known project version.

Query params:

- `since` required, non-negative integer

This is the reconnect and catch-up path.

### `POST /api/projects/{projectId}/events`

Appends a mutation event.

Important fields:

- `id`
- `entityId`
- `clientId`
- `userId`
- `timestamp`
- `expectedVersion`
- `action`

Important responses:

- `201` committed
- `409` optimistic concurrency conflict
- `422` domain validation failure
- `429` write rate limited

### `GET /api/projects/{projectId}/stream`

SSE endpoint for live updates.

Emits:

- `version`
- `project-event`
- `presence`
- `heartbeat`

The route uses a bounded server-side queue. Slow consumers are disconnected and expected to recover through `GET /events?since=<lastVersion>`.

## Error Contract

JSON error responses use:

```json
{
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

Common codes:

- `bad_request`
- `validation_error`
- `concurrency_conflict`
- `rate_limited`

## Notes

- `presence.update` exists in the shared event model but is not persisted through the append API.
- Undo/redo is client-driven and appears to the server as ordinary appended events.
