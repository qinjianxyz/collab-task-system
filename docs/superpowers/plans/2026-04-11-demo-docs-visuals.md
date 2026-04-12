# Demo Docs Visuals Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo docs presentation-ready by adding diagram-first architecture and scaling material that can be shown directly during the demo and Q&A.

**Architecture:** Keep the live demo script separate, but move the actual explanatory weight into the README, architecture doc, scaling doc, and a compact demo visual reference. Use ASCII diagrams and markdown tables so the content is legible in raw text and on GitHub.

**Tech Stack:** Markdown, ASCII diagrams, existing project docs under `README.md` and `docs/`.

---

## Chunk 1: Doc Structure

### Task 1: Add the design and plan artifacts

**Files:**
- Create: `docs/superpowers/specs/2026-04-11-demo-docs-visuals-design.md`
- Create: `docs/superpowers/plans/2026-04-11-demo-docs-visuals.md`

- [ ] **Step 1: Add the design spec**
- [ ] **Step 2: Add the implementation plan**
- [ ] **Step 3: Verify the files are under the project-local `docs/superpowers/` tree**

### Task 2: Reframe the demo doc entry points

**Files:**
- Modify: `docs/demo/README.md`
- Modify: `docs/demo-script.md`
- Modify: `docs/demo/video-script.md`

- [ ] **Step 1: Update file descriptions to emphasize repo-native docs**
- [ ] **Step 2: Make the script point to exact sections in README, architecture, and scaling**
- [ ] **Step 3: Remove language that implies a separate slide deck**

## Chunk 2: Presentation-Ready Core Docs

### Task 3: Enrich the root README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a compact system overview diagram**
- [ ] **Step 2: Add a sync sequence diagram**
- [ ] **Step 3: Add a concise event sourcing vs CRUD comparison**
- [ ] **Step 4: Keep the README short enough to present quickly**

### Task 4: Expand architecture deep-dive visuals

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Add a projection model diagram**
- [ ] **Step 2: Add a write path sequence**
- [ ] **Step 3: Add a reconnect and catch-up diagram**
- [ ] **Step 4: Add bounded-stream/failure callouts without inventing new behavior**

### Task 5: Expand scaling deep-dive visuals

**Files:**
- Modify: `docs/scaling.md`

- [ ] **Step 1: Add a read-path scaling diagram**
- [ ] **Step 2: Add a task-window/virtualization diagram**
- [ ] **Step 3: Add a clearer metrics table and interpretation**
- [ ] **Step 4: Tie the visuals directly back to the 2MB assignment constraint**

## Chunk 3: Demo Visual Reference

### Task 6: Replace the slide outline with a visual reference

**Files:**
- Modify: `docs/demo/slides.md`

- [ ] **Step 1: Retitle the file as a visual reference**
- [ ] **Step 2: Add compact architecture and scaling diagrams**
- [ ] **Step 3: Add short presenter prompts instead of speaker notes**
- [ ] **Step 4: Make the file useful as a one-screen cheat sheet**

## Chunk 4: Verification and Delivery

### Task 7: Review and verify the docs

**Files:**
- Verify: `README.md`
- Verify: `docs/architecture.md`
- Verify: `docs/scaling.md`
- Verify: `docs/demo/README.md`
- Verify: `docs/demo/slides.md`
- Verify: `docs/demo/video-script.md`
- Verify: `docs/demo-script.md`

- [ ] **Step 1: Review the diff for consistency and broken framing**
- [ ] **Step 2: Run `git diff --check`**
- [ ] **Step 3: Commit with a docs-focused message**
- [ ] **Step 4: Push `main`**
