# API Notes

The canonical machine-readable contract is [openapi.yaml](./openapi.yaml).

## Route Summary

- `POST /api/projects`
  - creates a new project by appending `project.create`
- `GET /api/projects/{projectId}/snapshot`
  - returns the current projected snapshot
- `GET /api/projects/{projectId}/events?since=N`
  - returns committed events after version `N`
- `POST /api/projects/{projectId}/events`
  - appends a validated project event
- `GET /api/projects/{projectId}/notifications?userId=alice`
  - returns durable mention notifications for the current user
- `POST /api/projects/{projectId}/presence`
  - updates ephemeral viewer and live-cursor state
- `GET /api/projects/{projectId}/tasks?limit=32&after=<cursor>`
  - returns a cursor-paged task window plus comments scoped to those tasks
- `GET /api/projects/{projectId}/stream`
  - SSE stream for `version`, `project-event`, `presence`, and `heartbeat`
  - bounded server-side buffering; slow consumers reconnect and catch up by version
- `GET /api/projects/{projectId}/tasks/{taskId}/description`
  - returns the current Yjs state for the collaborative task description
- `POST /api/projects/{projectId}/tasks/{taskId}/description`
  - applies a client-generated Yjs update to the shared task description
- `GET /api/projects/{projectId}/tasks/{taskId}/description/stream`
  - task-scoped SSE stream for collaborative description updates

## Error Semantics

- `400`
  - malformed JSON or invalid query parameters
- `409`
  - optimistic concurrency conflict on `expectedVersion`
- `422`
  - domain validation failure such as dependency cycles, blocked status transitions, or invalid deletes

## Why The Task Page Exists

The task page route is the scale-oriented read path:

- first page is loaded into the project workspace on initial render
- later pages are fetched by cursor
- comments are scoped to the visible task window
- the client can virtualize the loaded tasks instead of rendering an unbounded DOM

This keeps the write model unchanged while making the read path honest for larger projects.

## Collaboration-Specific Routes

The collaboration transport is intentionally layered:

- project SSE stream for committed events, version catch-up, presence, and live cursors
- task-description sync route plus SSE stream for low-latency collaborative text editing
- notification route for durable `@mentions`

That separation avoids overloading the append-event API with ephemeral state while keeping the durable system event-sourced.
