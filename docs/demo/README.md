# Demo Kit

Use this folder for the evaluator recording and any live walkthroughs.

## Files

- [video-script.md](./video-script.md): near-verbatim 5-minute narration
- [slides.md](./slides.md): lightweight slide outline with speaker notes
- [runbook.md](./runbook.md): operator checklist, prep commands, and fallback steps

## Recommended Recording Flow

1. Start the app and confirm the health endpoint is green.
2. Open two isolated browser contexts for the collaboration demo.
3. Record the live product flow first.
4. Show the README and supporting docs after the live demo proves the system works.
5. Close on architecture, scale proof, and tradeoffs.

## What To Show On Screen

- [README.md](../../README.md)
- [architecture.md](../architecture.md)
- [scaling.md](../scaling.md)
- [api.md](../api.md)

## Timing Map

- `0:00-0:30`: framing and thesis
- `0:30-2:15`: two-browser collaboration demo
- `2:15-3:15`: undo/redo, presence, activity feed, shortcuts
- `3:15-4:00`: dependency validation and domain rules
- `4:00-4:35`: large-project rendering and scale proof
- `4:35-5:00`: architecture, docs, tradeoffs

## Core Message

This is not CRUD with realtime bolted on later.

This is an event-sourced collaborative system where:

- writes are appended to one ordered event stream
- projections derive current state
- SSE distributes committed events
- undo/redo, activity, and sync all ride the same model
