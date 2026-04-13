# Scaling Notes

## What The Take-Home Actually Demands

The rubric does not require internet-scale throughput today. It requires an architecture that does not paint itself into a corner once projects become large.

The important constraint is:

`avoid retransmitting 2MB-plus project payloads during normal collaboration`

## Current Strategy

This repository already follows the right transmission model:

```text
initial project load -> snapshot
steady-state collaboration -> small committed events
reconnect / catch-up -> replay events since last version
```

That matters more than premature micro-optimization because it changes the shape of the system:

- writes are incremental
- sync is versioned
- activity and history come from the same log
- large projects do not require full-document rebroadcast on every mutation

## Two Demo Seeds On Purpose

### Realistic Demo Seed

Use the realistic seed to show:

- believable owners and comments
- dependency chains
- blocked transitions
- realtime collaboration

### Scale Benchmark Seed

Use the benchmark seed to show:

- larger ordered task sets
- stable positions
- deterministic data for comparison
- how the architecture behaves when the project is no longer tiny

The benchmark project is synthetic by design. Its job is to stress the structure of the app, not to tell the human narrative of the product.

## Current Limits In This Worktree

The following scale features are not yet shipped here:

- cursor-based pagination
- virtualized task rendering
- distributed Redis fan-out

That is why the benchmark seed should be presented honestly:

- as evidence that the data model can represent larger projects cleanly
- as a backdrop for explaining the next scaling steps
- not as proof that every scale optimization is already complete

## Next Scale Steps

The natural next steps are straightforward because the event model is already correct:

1. Page the task read model instead of loading every task into the snapshot.
2. Virtualize long task lists in the client.
3. Add Redis-backed pub/sub for cross-instance SSE fan-out.
4. Add backpressure controls and slow-consumer handling.
5. Benchmark replay windows and snapshot size under larger datasets.

## Why The Architecture Still Holds Up

Even before those optimizations land, the current design already avoids the biggest anti-pattern for this assignment:

`broadcasting whole mutable project blobs after every change`

The core benefit is structural:

- the server reasons in events
- the client converges by version
- the event log can support richer projections later without changing the write model

That is the right foundation for scaling this product responsibly.
