# Demo Visual Reference

Use this as a one-screen visual cheat sheet after the live product demo.

## Product Thesis

```text
Collab Task System
event-sourced collaborative task management
two browser contexts, sub-second sync, no managed realtime database
```

Presenter prompt:

- “The point is not CRUD plus realtime. The point is one ordered event stream driving state, sync, history, and collaboration.”

## Core Architecture

```text
client action
    |
    v
POST /events
    |
    v
validate -> append event -> apply projection -> commit
    |
    +--> Postgres event log remains source of truth
    +--> projection tables serve snapshots and validation
    +--> committed event is published to the project event bus
    |
    v
SSE stream fanout
    |
    v
all connected clients converge
```

Presenter prompt:

- “The architectural bet is transactional append plus projection, then event fanout.”

## Sync Sequence

```text
Client A                  Server                    Client B
  | optimistic apply        |                          |
  | POST /events            |                          |
  |------------------------>| append + project in tx  |
  |                         | publish event           |
  |                         |------------------------>|
  |<------------------------| committed response      |
  | clear optimistic state  |          SSE update -> apply
```

Presenter prompt:

- “The other client does not poll or refetch the whole project. It applies the committed event.”

## Domain Correctness

```text
dependency DAG
  Fix auth  ---->  Ship dashboard

attempt invalid transition:
  Ship dashboard -> in_progress
  while Fix auth != done

result:
  server rejects append with 422
  UI shows blocked transition message
```

Presenter prompt:

- “This rule is enforced at append time, so invalid state never becomes durable.”

## Scale Path

```text
first load:
  paged snapshot -> first task window

scroll:
  cursor-based /tasks page fetches

render:
  virtualized visible rows only

reconnect:
  /events?since=lastVersion
```

Presenter prompt:

- “The 2MB problem is solved by changing the sync unit from full project payloads to windows and events.”

## Measured Results

| Scenario | Result |
| --- | --- |
| `10,000` task seed | `209,839ms` |
| append throughput | `177.5 req/s`, `56.06ms p95` |
| paged initial load | `155.35ms p95` |
| reconnect catch-up | `44.47ms p95` |
| SSE fanout | `25` listeners, `115.16ms p95` |

Presenter prompt:

- “The repo includes runnable seed and load artifacts, so the scale claims are measured, not just asserted.”

## Q&A Anchors

If someone asks where to drill deeper:

- thesis and top-level system picture -> [README.md](../../README.md)
- write path and reconnect behavior -> [architecture.md](../architecture.md)
- 2MB constraint and performance proof -> [scaling.md](../scaling.md)
- route contracts -> [api.md](../api.md)
