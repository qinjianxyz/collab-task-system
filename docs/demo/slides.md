# Slide Outline

Use this if you want a light slide deck before or between the live product segments.

## Slide 1: Title

Content:

- Collab Task System
- Event-sourced collaborative task management
- Two tabs, sub-second sync, no managed real-time database

Speaker note:

“This project is an OSS reference implementation of collaborative task management built on an append-only event log.”

## Slide 2: Problem

Content:

- real-time collaboration across clients
- consistency without a managed realtime DB
- future-proof for large project payloads

Speaker note:

“The key challenge is not basic CRUD. It is efficient, correct synchronization as projects grow.”

## Slide 3: Thesis

Content:

- one ordered event stream per project
- transactional projections
- SSE fanout
- optimistic concurrency

Speaker note:

“Everything important derives from the event stream: state, sync, activity, and undo.”

## Slide 4: Live Demo Highlights

Content:

- two-browser task sync
- live comments
- presence
- undo/redo

Speaker note:

“The product demo proves near real-time convergence between clients without full project reloads.”

## Slide 5: Domain Correctness

Content:

- dependency DAG validation
- blocked status transitions
- conflict detection with `expectedVersion`

Speaker note:

“The server enforces the domain model at append time, so invalid state never becomes durable.”

## Slide 6: Scale Path

Content:

- paged snapshots
- cursor pagination
- virtualized task list
- bounded SSE buffers
- Redis-backed fanout and rate limiting

Speaker note:

“The architecture is designed around the take-home’s 2MB-plus constraint from the start.”

## Slide 7: OSS Quality

Content:

- migrations and Docker setup
- unit, integration, and Playwright e2e coverage
- OpenAPI and architecture docs

Speaker note:

“This is not just a demo. It is packaged as a credible OSS project.”

## Slide 8: Tradeoffs

Content:

- demo identity, no production auth
- presence is ephemeral
- full multi-app-node cluster automation is future work

Speaker note:

“The repo is honest about current tradeoffs while still proving the core architecture.”
