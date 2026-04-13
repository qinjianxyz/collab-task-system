# Demo Video Script

This is Collab Task System. It is a collaborative task manager built with Next.js, Postgres, Redis-capable realtime infrastructure, and server-sent events. The key architectural decision is that it is event-sourced instead of CRUD-first. Durable change becomes an event, and the current task state, realtime sync, undo and redo, activity, and mention notifications all derive from that same ordered stream.

I’m starting with the realistic demo project. This project is called Ship Collab Task System, and it is seeded with believable work instead of synthetic benchmark-only data. You can see real task names, owners, comments, dependency chains, and a mix of done, in-progress, todo, and blocked work.

I’m opening the same project in a second browser context now. I’m using two browser contexts instead of two tabs in one profile so presence is visible as two distinct viewers. I’ll set different display names in each window, and now you can see both viewers in the header.

Now I’m going to create a new task. I’ll call it Final README polish. Under Blocked by, I can choose prerequisite tasks. This is an important UX detail. These controls do not mean complete. They mean this new task depends on these existing tasks. I’ll choose a prerequisite and create the task.

As soon as I submit, the task appears in the second browser context. That is the core collaboration path. One client posts an append command, the server validates it, commits the next event, updates the projection tables in the same transaction, and then broadcasts the committed event over SSE so the other client converges.

Now I’ll change status in the second browser context. The first browser context updates almost immediately. Next I’ll focus the comment box in one browser context. The other browser context immediately shows a live cursor badge on that task, so you can see who is actively working where.

I’ll add a comment with an @mention now. The other browser context gets the comment, and the notification panel updates from a durable projection over the same comment stream. There is no separate notification write path behind it.

Now I’ll edit the task description. This is not just a normal textarea with last-write-wins. The description is backed by a task-scoped Yjs document, so the second browser context sees the text converge live. Durable checkpoints still come back through normal task.update events, which keeps the long-term state inside the same event-sourced model.

I’ll also edit and then delete the comment. The activity feed on the right updates from the same event stream. There is no separate audit subsystem behind it. It is just another projection over the project history.

Undo and redo use the same write model. I’ll undo and then redo. The important point is that undo here is not a client-only trick. The client computes the inverse action and sends it back through the normal append route, so history remains explicit and consistent with the rest of the system.

I also want to show the domain rules. This task here is blocked by a prerequisite that is not done yet. If I try to move it forward too early, the server rejects the transition. That matters because optimistic UI is only safe if the server is still the authority on consistency and domain validation. The client can feel fast, but invalid state does not get committed.

Before leaving the realistic project, I’ll switch into Board view and drag a card across columns. That move still becomes a normal task.update event with a new status and position. The second browser context converges because the board is just another projection over the same task model, not a separate subsystem.

Now I’m going to the README, because this is the document an evaluator can read after the demo and understand both the product and the system design. The first section explains what the product can do today: multi-project entry, task and comment lifecycle, dependencies, realtime sync, live cursors, collaborative descriptions, notifications, undo and redo, presence, activity, board view, paged task reads, and virtualized benchmark rendering.

The next important section is Architecture At A Glance. This is the heart of the project. The client sends an append command. The server appends the event and applies the projection update in the same SQL transaction. After commit, the server broadcasts the committed event over SSE. That is why the two browser contexts stay in sync without a managed realtime backend.

The Why Event Sourcing Instead Of CRUD section is the main thesis of the submission. The reason this is stronger than a CRUD app with realtime bolted on is that the event stream becomes the single source of truth for durable change. Realtime sync uses it directly. Undo and redo use it directly. The activity feed uses it directly. Notifications use it directly. Conflict handling also becomes clearer because the system uses ordered project versions and optimistic concurrency instead of silently letting clients overwrite each other. The ephemeral collaboration layers, like cursors and Yjs text sync, stay thin and focused instead of turning into a second database.

Now I’m switching to the scale benchmark project. This project is intentionally synthetic. Its job is not to tell a human story. Its job is to show that the read path still makes sense once the project is much larger. On first load, the workspace does not hydrate the entire task list. It renders the first task window, and as I scroll, the next page is fetched by cursor. The benchmark list is also virtualized, so the DOM only holds the visible rows instead of every loaded row at once. The repository also includes heavier seed runs at ten thousand and thirty thousand tasks to show that the scale claim is not just theoretical.

That scale story is documented in the scaling notes and backed by load probes in the repository. The important point is that the write model did not change to get there. Writes are still events, projections are still transactional, and clients still converge by committed version.

So the summary is straightforward. This repository solves the take-home as a collaborative system, not just a CRUD demo. It shows realtime cross-client sync, live cursors, collaborative descriptions, notifications, consistency through ordered event commits, transactional projections, dependency validation, task and comment lifecycle, activity, presence, undo and redo, board drag-and-drop, and a read path that is honest about larger projects. That is why this is the right architecture for the problem.
