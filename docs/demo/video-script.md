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

I want to close with the engineering reasoning behind the system, because the architecture decisions matter more than the feature list.

The first question I asked myself was: what is the real problem here? The take-home says real-time collaboration, but the deeper constraint is that the system must stay consistent across clients without a managed real-time database. That rules out the easy path — Firebase, Supabase, Liveblocks — and forces you to own the consistency model yourself. Once you accept that responsibility, the architecture question becomes: where does truth live, and how does it propagate?

In a CRUD system, truth lives in the current row. You read it, mutate it, write it back. Real-time sync becomes a bolt-on — you poll, or you add a WebSocket layer that pushes diffs. But the sync layer and the data layer are fundamentally separate systems with separate consistency guarantees. That is where most collaborative apps start to leak: the WebSocket says one thing, the database says another, and the client has to reconcile.

Event sourcing eliminates that split. Truth is the ordered event stream. The current state is a projection — a materialized view that can be rebuilt from the log at any time. When I broadcast a committed event over SSE, I am not sending a notification about a change that happened elsewhere. I am sending the change itself. The client applies it to its local projection the same way the server did. There is no translation layer, no diff format, no separate sync protocol. The event IS the sync.

That single decision — events as the unit of both persistence and distribution — is what makes undo/redo, activity feeds, presence, and conflict detection fall out naturally instead of being separate subsystems. Undo is just an inverse event sent through the normal write path. Activity is a projection over recent events. Conflict detection is a version check on the append boundary. None of these required a new abstraction. They all ride the same model.

The hardest problem I solved was concurrency at scale. The naive approach — a single version counter per project — works fine for small projects, but at ten thousand tasks, two users editing different tasks almost always conflict because any event anywhere advances the global counter. I studied how Linear and Replicache handle this and implemented per-entity versioning: each task tracks its own version, and the mutation endpoint locks and checks only that specific row. The global project version still increments for SSE ordering, but it is no longer a concurrency gate. This means two users editing different tasks never produce a false conflict, which is the behavior you actually want in a collaborative system.

The tradeoff I want to be honest about is that this is a take-home, not a production system. There are real next steps: embedding retrieval for better task search, horizontal read scaling with replicas, a proper auth layer beyond demo identity, and running the full benchmark suite under sustained concurrent load. I documented those explicitly in the README because I think it is more valuable to show that I understand the gap between a well-architected prototype and a production deployment than to pretend the gap does not exist.

The thesis of this submission is that the right architecture for collaborative task management is not CRUD with real-time bolted on. It is an event-sourced system where collaboration, consistency, and history are first-class concerns from the foundation up. Everything in this repo — the sync, the undo, the activity feed, the dependency validation, the scale path — derives from that one decision.
