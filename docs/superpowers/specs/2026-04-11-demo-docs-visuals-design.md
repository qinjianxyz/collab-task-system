# Demo Docs Visuals Design

## Goal

Turn the project-local markdown docs into presentation-ready artifacts that support two phases of the demo:

1. a short scripted product walkthrough
2. a deeper architecture and scale discussion after the live demo

The docs should be useful on screen without requiring a separate slide deck.

## Problem

The existing demo docs covered narration and operator setup, but the supporting markdown was still optimized for reading, not presenting. The `slides.md` file also framed itself as a deck outline, which does not match the intended usage.

## Design

The presentation package should be diagram-first and repo-native:

- `README.md` should carry the product thesis, one system overview diagram, one sync sequence, and a concise CRUD-vs-event-sourcing comparison.
- `docs/architecture.md` should be the post-demo deep dive with explicit diagrams for write path, projection model, reconnect/catch-up, and failure handling.
- `docs/scaling.md` should visually explain the 2MB constraint response, task windowing, virtualization, and the measured results.
- `docs/demo/slides.md` should stop pretending to be a deck and become a visual reference page with compact diagrams and charts that are easy to show in a screen share.
- `docs/demo/README.md`, `docs/demo-script.md`, and `docs/demo/video-script.md` should point to those real docs instead of treating the demo materials as a separate parallel narrative.

## Constraints

- Keep all files inside the project repo under `docs/` or the project root `README.md`.
- Do not add enterprise-os repo-level docs.
- Prefer ASCII diagrams and markdown tables so the content is readable both in raw markdown and on GitHub.
- Keep the docs truthful to the shipped system; no aspirational diagrams that imply features we have not implemented.

## Success Criteria

- The live demo can point to the README for the thesis and top-level architecture.
- The walkthrough can then move into `docs/architecture.md` and `docs/scaling.md` to answer likely evaluator questions.
- The `docs/demo/slides.md` file becomes a compact visual cheat sheet rather than a separate slide script.
- The demo docs read like part of a serious OSS repo, not temporary presentation notes.
