import { expect, test, type Browser } from "@playwright/test";

import { closeDatabasePool } from "../../src/server/db/client";
import { resetDatabase, waitForDatabase } from "../../src/server/db/testing";
import { appendEvent } from "../../src/server/events/event-store";

const baseTimestamp = 1_716_000_000_000;

async function createIdentityContext(
  browser: Browser,
  identity: {
    clientId: string;
    displayName: string;
  },
) {
  const context = await browser.newContext();
  await context.addInitScript((value) => {
    window.localStorage.setItem("collab-task-system.client-id", value.clientId);
    window.localStorage.setItem("collab-task-system.display-name", value.displayName);
  }, identity);

  return context;
}

async function seedTaskRange(
  projectId: string,
  options: {
    count: number;
    clientId: string;
    userId: string;
    startingVersion?: number;
    startingTimestamp?: number;
  },
) {
  let expectedVersion = options.startingVersion ?? 1;
  let timestamp = options.startingTimestamp ?? baseTimestamp + 1_000;

  for (let index = 1; index <= options.count; index += 1) {
    const taskId = `task_seed_${projectId}_${index}`;

    await appendEvent({
      id: `evt_seed_task_${projectId}_${index}`,
      projectId,
      entityId: taskId,
      clientId: options.clientId,
      userId: options.userId,
      timestamp,
      expectedVersion,
      action: {
        type: "task.create",
        data: {
          title: `Seed task ${index}`,
          status: "todo",
          projectId,
          position: index,
        },
      },
    });

    expectedVersion += 1;
    timestamp += 1;
  }
}

test.beforeAll(async () => {
  await waitForDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await closeDatabasePool();
});

test("creates a project from the landing page and navigates into the workspace", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Display name").fill("alice");
  await page.getByLabel("Project name").fill("Launch Ready");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/.+$/);
  await expect(page.getByRole("heading", { name: "Launch Ready" })).toBeVisible();
  await expect(page.locator(".status-pill")).toHaveText("connected");
  await expect(page.locator(".viewer-chip")).toContainText(["alice"]);
});

test("landing page lists existing projects and lets you open a selected workspace", async ({
  page,
  request,
}) => {
  const firstProject = await request.post("/api/projects", {
    data: {
      name: "Alpha Workspace",
      clientId: "client_alpha",
      userId: "alice",
    },
  });
  const secondProject = await request.post("/api/projects", {
    data: {
      name: "Beta Workspace",
      clientId: "client_beta",
      userId: "bob",
    },
  });

  expect(firstProject.ok()).toBeTruthy();
  expect(secondProject.ok()).toBeTruthy();

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Recent projects" })).toBeVisible();
  await expect(page.getByText("Alpha Workspace")).toBeVisible();
  await expect(page.getByText("Beta Workspace")).toBeVisible();

  await page.getByRole("link", { name: "Open Beta Workspace" }).click();

  await expect(page).toHaveURL(/\/projects\/.+$/);
  await expect(page.getByRole("heading", { name: "Beta Workspace" })).toBeVisible();
});

test("two project pages converge when a task is appended through the API", async ({
  browser,
  page,
  request,
}) => {
  const taskEventId = crypto.randomUUID();
  const taskEntityId = crypto.randomUUID();
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Browser Sync Demo",
      clientId: "client_e2e",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const createProjectPayload = await createProjectResponse.json();
  const projectId = createProjectPayload.projectId as string;

  const secondPage = await browser.newPage();

  await page.goto(`/projects/${projectId}`);
  await secondPage.goto(`/projects/${projectId}`);

  await expect(page.locator("h1")).toHaveText("Browser Sync Demo");
  await expect(secondPage.locator("h1")).toHaveText("Browser Sync Demo");
  await expect(page.locator(".status-pill")).toHaveText("connected");
  await expect(secondPage.locator(".status-pill")).toHaveText("connected");

  const appendEventResponse = await request.post(`/api/projects/${projectId}/events`, {
    data: {
      id: taskEventId,
      entityId: taskEntityId,
      clientId: "client_e2e",
      userId: "alice",
      timestamp: baseTimestamp,
      expectedVersion: 1,
      action: {
        type: "task.create",
        data: {
          title: "Appears in both tabs",
          status: "todo",
          projectId,
        },
      },
    },
  });

  expect(appendEventResponse.ok()).toBeTruthy();

  await expect(
    page.getByRole("heading", { name: "Appears in both tabs" }),
  ).toBeVisible();
  await expect(
    secondPage.getByRole("heading", { name: "Appears in both tabs" }),
  ).toBeVisible();

  await secondPage.close();
});

test("presence, activity, undo, and redo converge across two browser contexts", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Phase 3 Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const createProjectPayload = await createProjectResponse.json();
  const projectId = createProjectPayload.projectId as string;

  const aliceContext = await createIdentityContext(browser, {
    clientId: "client_alice",
    displayName: "alice",
  });
  const bobContext = await createIdentityContext(browser, {
    clientId: "client_bob",
    displayName: "bob",
  });

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);
  await bobPage.goto(`/projects/${projectId}`);

  await expect(alicePage.locator(".status-pill")).toHaveText("connected");
  await expect(bobPage.locator(".status-pill")).toHaveText("connected");
  await expect(alicePage.locator(".viewer-chip")).toHaveCount(2);
  await expect(bobPage.locator(".viewer-chip")).toHaveCount(2);
  await expect(alicePage.locator(".viewer-chip")).toContainText(["alice", "bob"]);
  await expect(bobPage.locator(".viewer-chip")).toContainText(["alice", "bob"]);

  await alicePage.getByLabel("Add task").fill("Undo me");
  await alicePage.getByRole("button", { name: "Add task" }).click();

  await expect(alicePage.getByRole("heading", { name: "Undo me" })).toBeVisible();
  await expect(bobPage.getByRole("heading", { name: "Undo me" })).toBeVisible();
  await expect(alicePage.getByText('created task "Undo me"')).toBeVisible();

  await alicePage.getByRole("button", { name: "Undo" }).click();

  await expect(alicePage.getByRole("heading", { name: "Undo me" })).toHaveCount(0);
  await expect(bobPage.getByRole("heading", { name: "Undo me" })).toHaveCount(0);
  await expect(alicePage.getByText("deleted a task")).toBeVisible();

  await alicePage.getByRole("button", { name: "Redo" }).click();

  await expect(alicePage.getByRole("heading", { name: "Undo me" })).toBeVisible();
  await expect(bobPage.getByRole("heading", { name: "Undo me" })).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});

test("stale clients recover from a version conflict and converge after retry", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Conflict Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  await request.post(`/api/projects/${projectId}/events`, {
    data: {
      id: crypto.randomUUID(),
      entityId: "task_conflict",
      clientId: "client_alice",
      userId: "alice",
      timestamp: baseTimestamp,
      expectedVersion: 1,
      action: {
        type: "task.create",
        data: {
          title: "Race task",
          status: "todo",
          projectId,
        },
      },
    },
  });

  const aliceContext = await createIdentityContext(browser, {
    clientId: "client_alice",
    displayName: "alice",
  });
  const bobContext = await createIdentityContext(browser, {
    clientId: "client_bob",
    displayName: "bob",
  });

  await bobContext.route(`**/api/projects/${projectId}/stream**`, (route) => route.abort());

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);
  await bobPage.goto(`/projects/${projectId}`);

  await expect(alicePage.locator(".status-pill")).toHaveText("connected");
  await expect(bobPage.locator(".status-pill")).toHaveText("reconnecting");

  const aliceTaskCard = alicePage.locator("article", {
    has: alicePage.getByRole("heading", { name: "Race task" }),
  });
  await aliceTaskCard.locator(".status-button").click();
  await expect(aliceTaskCard.locator(".status-button")).toHaveText("in_progress");
  await aliceTaskCard.locator(".status-button").click();
  await expect(aliceTaskCard.locator(".status-button")).toHaveText("done");

  const bobTaskCard = bobPage.locator("article", {
    has: bobPage.getByRole("heading", { name: "Race task" }),
  });
  await bobTaskCard.locator(".status-button").click();

  await expect(bobTaskCard.locator(".status-button")).toHaveText("in_progress");
  await expect(aliceTaskCard.locator(".status-button")).toHaveText("in_progress");
  await expect(bobPage.locator(".error-banner")).toHaveCount(0);

  await aliceContext.close();
  await bobContext.close();
});

test("dependencies, blocked transitions, comments, and shortcut help are visible in the UI", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Dependency Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  const aliceContext = await createIdentityContext(browser, {
    clientId: "client_alice",
    displayName: "alice",
  });
  const bobContext = await createIdentityContext(browser, {
    clientId: "client_bob",
    displayName: "bob",
  });

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);
  await bobPage.goto(`/projects/${projectId}`);

  await expect(alicePage.locator(".status-pill")).toHaveText("connected");
  await expect(bobPage.locator(".status-pill")).toHaveText("connected");

  await alicePage.getByLabel("Add task").fill("Fix auth");
  await alicePage.getByRole("button", { name: "Add task" }).click();

  await expect(alicePage.getByRole("heading", { name: "Fix auth" })).toBeVisible();
  await expect(bobPage.getByRole("heading", { name: "Fix auth" })).toBeVisible();

  await alicePage.getByLabel("Add task").fill("Ship dashboard");
  await alicePage.getByLabel("Depends on Fix auth").check();
  await alicePage.getByRole("button", { name: "Add task" }).click();

  await expect(alicePage.getByRole("heading", { name: "Ship dashboard" })).toBeVisible();
  await expect(alicePage.getByText("Depends on: Fix auth")).toBeVisible();
  await expect(bobPage.getByText("Depends on: Fix auth")).toBeVisible();

  const fixAuthCard = bobPage.locator("article", {
    has: bobPage.getByRole("heading", { name: "Fix auth" }),
  });

  await fixAuthCard.getByRole("button", { name: "Delete task" }).click();
  await expect(
    bobPage.locator(".error-banner"),
  ).toContainText('Task "Fix auth" cannot be deleted while "Ship dashboard" depends on it.');

  await bobPage
    .locator("article", { has: bobPage.getByRole("heading", { name: "Ship dashboard" }) })
    .locator(".status-button")
    .click();

  await expect(bobPage.getByText('Blocked: dependency "Fix auth" must be completed first.')).toBeVisible();
  await fixAuthCard.locator(".status-button").click();
  await expect(
    alicePage.locator("article", { has: alicePage.getByRole("heading", { name: "Fix auth" }) }).locator(".status-button"),
  ).toHaveText("in_progress");
  await fixAuthCard.locator(".status-button").click();
  await expect(
    alicePage.locator("article", { has: alicePage.getByRole("heading", { name: "Fix auth" }) }).locator(".status-button"),
  ).toHaveText("done");

  const dashboardCard = bobPage.locator("article", {
    has: bobPage.getByRole("heading", { name: "Ship dashboard" }),
  });
  await dashboardCard.locator(".status-button").click();
  await expect(
    alicePage.locator("article", { has: alicePage.getByRole("heading", { name: "Ship dashboard" }) }).locator(".status-button"),
  ).toHaveText("in_progress");

  await dashboardCard.getByPlaceholder("Add a comment with @mentions").fill("Looks good");
  await dashboardCard.getByRole("button", { name: "Comment" }).click();
  await expect(alicePage.getByText("Looks good", { exact: true })).toBeVisible();
  await expect(bobPage.getByText("Looks good", { exact: true })).toBeVisible();

  await alicePage.keyboard.press("Shift+Slash");
  await expect(alicePage.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible();
  await expect(alicePage.getByText("Ctrl+Z / Cmd+Z")).toBeVisible();
  await alicePage.keyboard.press("Escape");
  await expect(alicePage.getByRole("heading", { name: "Keyboard shortcuts" })).toHaveCount(0);

  await alicePage.keyboard.press("KeyN");
  await expect(alicePage.getByLabel("Add task")).toBeFocused();

  await aliceContext.close();
  await bobContext.close();
});

test("workspace collaboration surfaces expose accessible live regions and modal semantics", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Accessibility Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  const aliceContext = await createIdentityContext(browser, {
    clientId: "client_alice",
    displayName: "alice",
  });
  const alicePage = await aliceContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);

  await expect(alicePage.getByRole("status")).toHaveText("connected");
  await expect(alicePage.getByRole("list", { name: "Who is viewing this project" })).toBeVisible();
  await expect(alicePage.getByRole("list", { name: "Activity feed" })).toBeVisible();

  await alicePage.getByLabel("Add task").fill("Accessible task");
  await alicePage.getByRole("button", { name: "Add task" }).click();
  await expect(alicePage.getByRole("list", { name: "Task list" })).toBeVisible();

  await alicePage.keyboard.press("Shift+Slash");
  const shortcutsDialog = alicePage.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(shortcutsDialog).toBeVisible();
  await expect(shortcutsDialog).toHaveAttribute("aria-modal", "true");

  await aliceContext.close();
});

test("comment edits converge across two tabs", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Comment Edit Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  const aliceContext = await createIdentityContext(browser, {
    clientId: "client_alice",
    displayName: "alice",
  });
  const bobContext = await createIdentityContext(browser, {
    clientId: "client_bob",
    displayName: "bob",
  });

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);
  await bobPage.goto(`/projects/${projectId}`);

  await alicePage.getByLabel("Add task").fill("Comment target");
  await alicePage.getByRole("button", { name: "Add task" }).click();

  const bobTaskCard = bobPage.locator("article", {
    has: bobPage.getByRole("heading", { name: "Comment target" }),
  });
  await bobTaskCard.getByPlaceholder("Add a comment with @mentions").fill("Draft comment");
  await bobTaskCard.getByRole("button", { name: "Comment" }).click();

  await expect(alicePage.getByText("Draft comment", { exact: true })).toBeVisible();

  await bobTaskCard.getByRole("button", { name: "Edit comment" }).click();
  await bobTaskCard.getByRole("textbox", { name: "Edit comment text" }).fill("Edited comment");
  await bobTaskCard.getByRole("button", { name: "Save comment" }).click({ force: true });

  await expect(alicePage.getByText("Edited comment", { exact: true })).toBeVisible();
  await expect(bobPage.getByText("Edited comment", { exact: true })).toBeVisible();
  await expect(alicePage.getByText("Draft comment", { exact: true })).toHaveCount(0);

  await aliceContext.close();
  await bobContext.close();
});

test("stale comment editors surface an error after another tab deletes the comment", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Comment Edit Conflict Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  const createTaskResponse = await request.post(`/api/projects/${projectId}/events`, {
    data: {
      id: crypto.randomUUID(),
      entityId: "task_conflict_target",
      clientId: "client_alice",
      userId: "alice",
      timestamp: baseTimestamp + 1,
      expectedVersion: 1,
      action: {
        type: "task.create",
        data: {
          title: "Conflict target",
          status: "todo",
          projectId,
        },
      },
    },
  });

  expect(createTaskResponse.ok()).toBeTruthy();

  const aliceContext = await createIdentityContext(browser, {
    clientId: "client_alice",
    displayName: "alice",
  });
  const bobContext = await createIdentityContext(browser, {
    clientId: "client_bob",
    displayName: "bob",
  });

  await bobContext.route(`**/api/projects/${projectId}/stream**`, (route) => route.abort());

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);
  await bobPage.goto(`/projects/${projectId}`);
  await expect(bobPage.locator(".status-pill")).toHaveText("reconnecting");

  const bobTaskCard = bobPage.locator("article", {
    has: bobPage.getByRole("heading", { name: "Conflict target" }),
  });
  const aliceTaskCard = alicePage.locator("article", {
    has: alicePage.getByRole("heading", { name: "Conflict target" }),
  });

  await bobTaskCard.getByPlaceholder("Add a comment with @mentions").fill("Comment to edit");
  await bobTaskCard.getByRole("button", { name: "Comment" }).click();
  await expect(alicePage.getByText("Comment to edit", { exact: true })).toBeVisible();

  await bobTaskCard.getByRole("button", { name: "Edit comment" }).click();
  await bobTaskCard.getByRole("textbox", { name: "Edit comment text" }).fill("Edited too late");

  await aliceTaskCard.getByRole("button", { name: "Delete comment" }).click();
  await expect(alicePage.getByText("Comment to edit", { exact: true })).toHaveCount(0);

  await bobTaskCard.getByRole("button", { name: "Save comment" }).click();

  await expect(bobPage.locator(".error-banner")).toContainText(
    "comment was deleted before your edit could be saved",
  );
  await expect(bobPage.getByText("Edited too late", { exact: true })).toHaveCount(0);
  await expect(alicePage.getByText("Edited too late", { exact: true })).toHaveCount(0);

  await aliceContext.close();
  await bobContext.close();
});

test("task and comment deletion converge across two tabs", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Delete Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  const aliceContext = await createIdentityContext(browser, {
    clientId: "client_alice",
    displayName: "alice",
  });
  const bobContext = await createIdentityContext(browser, {
    clientId: "client_bob",
    displayName: "bob",
  });

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);
  await bobPage.goto(`/projects/${projectId}`);

  await alicePage.getByLabel("Add task").fill("Disposable task");
  await alicePage.getByRole("button", { name: "Add task" }).click();

  const bobTaskCard = bobPage.locator("article", {
    has: bobPage.getByRole("heading", { name: "Disposable task" }),
  });
  await expect(bobTaskCard).toBeVisible();

  await bobTaskCard.getByPlaceholder("Add a comment with @mentions").fill("Disposable comment");
  await bobTaskCard.getByRole("button", { name: "Comment" }).click();

  await expect(alicePage.getByText("Disposable comment", { exact: true })).toBeVisible();

  await bobTaskCard.getByRole("button", { name: "Delete comment" }).click();
  await expect(alicePage.getByText("Disposable comment", { exact: true })).toHaveCount(0);
  await expect(bobPage.getByText("deleted a comment")).toBeVisible();

  await bobTaskCard.getByRole("button", { name: "Delete task" }).click();
  await expect(alicePage.getByRole("heading", { name: "Disposable task" })).toHaveCount(0);
  await expect(bobPage.getByRole("heading", { name: "Disposable task" })).toHaveCount(0);
  await expect(alicePage.getByText("deleted a task")).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});

test("large task lists stay windowed and can load the next page", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Virtualized Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  await seedTaskRange(projectId, {
    count: 130,
    clientId: "client_alice",
    userId: "alice",
  });

  const aliceContext = await createIdentityContext(browser, {
    clientId: "client_alice",
    displayName: "alice",
  });
  const alicePage = await aliceContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);

  await expect(alicePage.locator(".status-pill")).toHaveText("connected");
  await expect(alicePage.getByText("130 tasks")).toBeVisible();

  await expect
    .poll(async () => alicePage.locator(".task-card").count())
    .toBeLessThanOrEqual(16);

  await expect(alicePage.getByRole("heading", { name: "Seed task 1" })).toBeVisible();
  await expect(alicePage.getByRole("heading", { name: "Seed task 130" })).toHaveCount(0);

  await alicePage.getByRole("button", { name: "Load more tasks" }).click();
  await alicePage.getByLabel("Task list").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });

  await expect(alicePage.getByRole("heading", { name: "Seed task 130" })).toBeVisible();
  await expect
    .poll(async () => alicePage.locator(".task-card").count())
    .toBeLessThanOrEqual(16);

  await aliceContext.close();
});

test("offline clients reconnect, catch up missed events, and return to connected", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Reconnect Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });

  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  const aliceContext = await createIdentityContext(browser, {
    clientId: "client_alice",
    displayName: "alice",
  });
  const bobContext = await createIdentityContext(browser, {
    clientId: "client_bob",
    displayName: "bob",
  });

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);
  await bobPage.goto(`/projects/${projectId}`);

  await expect(alicePage.locator(".status-pill")).toHaveText("connected");
  await expect(bobPage.locator(".status-pill")).toHaveText("connected");

  await bobContext.setOffline(true);

  await alicePage.getByLabel("Add task").fill("Missed while offline");
  await alicePage.getByRole("button", { name: "Add task" }).click();
  await expect(alicePage.getByRole("heading", { name: "Missed while offline" })).toBeVisible();

  await bobContext.setOffline(false);

  await expect(bobPage.locator(".status-pill")).toHaveText("connected");
  await expect(bobPage.locator(".error-banner")).toHaveCount(0);
  await expect(bobPage.getByRole("heading", { name: "Missed while offline" })).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});
