# Demo Video Script

This is Collab Task System. It is a collaborative task manager built with Next.js, Postgres, and server-sent events, and the core idea is that the system is event-sourced instead of CRUD-first. Every meaningful change becomes an event, and the current product state, the realtime sync, the activity feed, and undo and redo all derive from that same ordered stream.

I’m going to start with the realistic demo project. This project is called Ship Collab Task System, and it is seeded with believable work instead of fake benchmark-only data. You can see real task names, real dependency chains, comments, owners, and a mix of done, in-progress, todo, and blocked work.

I’m opening the same project in a second browser context now. I’m using two browser contexts instead of two tabs in one profile so presence is visible as two distinct viewers. I’ll set different display names in each window, and now you can see both viewers in the header.

Now I’m going to create a new task. I’ll call it Final README polish. Under Blocked by, I can choose prerequisite tasks. This is an important detail in the UI. These checkboxes do not mean complete. They mean this new task depends on these existing tasks. I’ll select Rewrite README architecture section as a prerequisite and create the task.

As soon as I submit, the task appears in the second browser context. That is the core collaboration path. One client posts an append command, the server validates it, commits the next event, updates the projections in the same transaction, and then broadcasts the committed event over SSE so the other client converges.

Now I’ll change the status of a task in the second browser context. You can see the first browser context update almost immediately. I’ll add a comment here as well, and it appears in both places. The activity feed on the right updates from that same event stream. There is no separate audit subsystem behind it. It is just another projection over the project history.

Undo and redo work through the same model. I’ll press undo now, and then redo. The important point is that undo here is not a client-only trick. The client computes the inverse action and sends it back through the normal write path. That means history remains explicit and consistent with the rest of the system.

I also want to show the domain rules. This task here is blocked by a prerequisite task that is not done yet. If I try to move it forward too early, the server rejects the transition. That matters because optimistic UI is only safe if the server is still the authority on consistency and domain validation. The client can feel fast, but invalid state does not get committed.

Now that the live behavior is clear, I’m going to the README because that is the document an evaluator can read after the demo and understand both the product and the system design. The first section explains what the repository proves right now: multiple projects, realtime task and comment sync, dependency enforcement, undo and redo, presence, and an activity feed, all without relying on a managed realtime database.

The next important section is Architecture At A Glance. This is the heart of the project. The client sends an append command. The server appends the event and applies the projection update in the same SQL transaction. After commit, the server broadcasts the committed event over SSE. That is why the two browser contexts stay in sync without a Firebase- or Supabase-style backend.

The Why Event Sourcing Is The Right Fit section is the main thesis of the submission. The reason this is stronger than a CRUD app with realtime bolted on is that the event stream becomes the single source of truth for change. Realtime sync uses it directly. Undo and redo use it directly. The activity feed uses it directly. Conflict handling also becomes clearer because the system uses ordered project versions and optimistic concurrency instead of silently letting clients overwrite each other.

The README also explains the two demo seeds. The realistic project is for product quality and collaboration behavior. The scale benchmark is for discussing larger datasets and the transmission model. I’m switching to the scale project now. This project is intentionally synthetic. Its job is not to tell a human story. Its job is to show that the data model and sync model still make sense once the project is much larger.

The honest tradeoff is that this worktree does not claim every scale optimization is already finished. The architecture is right, and the benchmark project helps explain the next steps, but the README and scaling notes are explicit about what is shipped today and what is the natural next extension. That is deliberate. I would rather make a truthful architecture claim than overstate the implementation.

So the summary is straightforward. This repository solves the take-home as a collaborative system, not just a CRUD demo. It shows realtime cross-client sync, consistency through ordered event commits, transactional projections, dependency validation, comments, activity, presence, and undo and redo, all on top of the same event stream. That is the main reason I believe this is the right architecture for the problem.
