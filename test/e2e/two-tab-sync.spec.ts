import { expect, test, type Browser } from "@playwright/test";

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
  await expect(page.locator(".status-pill")).toHaveText("Live");
  await expect(secondPage.locator(".status-pill")).toHaveText("Live");

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

  await expect(alicePage.locator(".status-pill")).toHaveText("Live");
  await expect(bobPage.locator(".status-pill")).toHaveText("Live");
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

test("task descriptions converge across two browser contexts", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Description Collab",
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

  await alicePage.getByLabel("Add task").fill("Draft README");
  await alicePage.getByRole("button", { name: "Add task" }).click();

  const aliceCard = alicePage.locator("article", {
    has: alicePage.getByRole("heading", { name: "Draft README" }),
  });
  const bobCard = bobPage.locator("article", {
    has: bobPage.getByRole("heading", { name: "Draft README" }),
  });

  const aliceDescription = aliceCard.getByLabel("Task description");
  const bobDescription = bobCard.getByLabel("Task description");

  await aliceDescription.fill("Collaborative editing over SSE and Yjs");
  await expect(bobDescription).toHaveValue("Collaborative editing over SSE and Yjs");

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

  await expect(alicePage.locator(".status-pill")).toHaveText("Live");
  await expect(bobPage.locator(".status-pill")).toHaveText("Live");

  await alicePage.getByLabel("Add task").fill("Fix auth");
  await alicePage.getByRole("button", { name: "Add task" }).click();

  await expect(alicePage.getByRole("heading", { name: "Fix auth" })).toBeVisible();
  await expect(bobPage.getByRole("heading", { name: "Fix auth" })).toBeVisible();

  await alicePage.getByLabel("Add task").fill("Ship dashboard");
  await alicePage.getByLabel("Blocked by Fix auth").check();
  await alicePage.getByRole("button", { name: "Add task" }).click();

  await expect(alicePage.getByRole("heading", { name: "Ship dashboard" })).toBeVisible();
  await expect(alicePage.getByText("Blocked by: Fix auth")).toBeVisible();
  await expect(bobPage.getByText("Blocked by: Fix auth")).toBeVisible();

  await bobPage
    .locator("article", { has: bobPage.getByRole("heading", { name: "Ship dashboard" }) })
    .locator(".status-button")
    .click();

  await expect(bobPage.getByText('Blocked: dependency "Fix auth" must be completed first.')).toBeVisible();

  const fixAuthCard = bobPage.locator("article", {
    has: bobPage.getByRole("heading", { name: "Fix auth" }),
  });
  await fixAuthCard.locator(".status-button").click();
  await expect(
    alicePage.locator("article", { has: alicePage.getByRole("heading", { name: "Fix auth" }) }).locator(".status-button"),
  ).toHaveText("In Progress");
  await fixAuthCard.locator(".status-button").click();
  await expect(
    alicePage.locator("article", { has: alicePage.getByRole("heading", { name: "Fix auth" }) }).locator(".status-button"),
  ).toHaveText("Done");

  const dashboardCard = bobPage.locator("article", {
    has: bobPage.getByRole("heading", { name: "Ship dashboard" }),
  });
  await dashboardCard.locator(".status-button").click();
  await expect(
    alicePage.locator("article", { has: alicePage.getByRole("heading", { name: "Ship dashboard" }) }).locator(".status-button"),
  ).toHaveText("In Progress");

  await bobPage
    .locator("article", { has: bobPage.getByRole("heading", { name: "Ship dashboard" }) })
    .getByPlaceholder("Add a comment with @mentions")
    .focus();
  await expect(
    alicePage
      .locator("article", { has: alicePage.getByRole("heading", { name: "Ship dashboard" }) })
      .getByText("bob is commenting"),
  ).toBeVisible();

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

test("landing page lists existing projects and opens a selected project", async ({
  page,
  request,
}) => {
  const alphaResponse = await request.post("/api/projects", {
    data: {
      name: "Alpha Workspace",
      clientId: "client_alpha",
      userId: "alice",
    },
  });
  expect(alphaResponse.ok()).toBeTruthy();

  const betaResponse = await request.post("/api/projects", {
    data: {
      name: "Beta Workspace",
      clientId: "client_beta",
      userId: "bob",
    },
  });
  expect(betaResponse.ok()).toBeTruthy();
  const betaPayload = await betaResponse.json();

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Event-sourced collaborative task management" })).toBeVisible();
  await expect(page.locator("a.project-catalog-item", { hasText: "Alpha Workspace" }).first()).toBeVisible();
  await expect(page.locator(`a[href="/projects/${betaPayload.projectId}"]`)).toBeVisible();

  await page.locator(`a[href="/projects/${betaPayload.projectId}"]`).click();
  await expect(page).toHaveURL(`/projects/${betaPayload.projectId}`);
  await expect(page.getByRole("heading", { name: "Beta Workspace" })).toBeVisible();
});

test("workspace supports deleting tasks and editing or deleting comments", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Workspace Lifecycle",
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
  await expect(alicePage.locator(".status-pill")).toHaveText("Live");

  await alicePage.getByLabel("Add task").fill("Document release candidate");
  await alicePage.getByRole("button", { name: "Add task" }).click();

  const taskCard = alicePage.locator("article", {
    has: alicePage.getByRole("heading", { name: "Document release candidate" }),
  });
  await expect(taskCard).toBeVisible();

  await taskCard.getByPlaceholder("Add a comment with @mentions").fill("Needs one final README pass");
  await taskCard.getByRole("button", { name: "Comment" }).click();
  await expect(taskCard.getByText("Needs one final README pass", { exact: true })).toBeVisible();

  await taskCard.getByRole("button", { name: "Edit comment" }).click();
  await taskCard.getByLabel("Edit comment").fill("Needs one final README and API pass");
  await taskCard.getByRole("button", { name: "Save comment" }).click();
  await expect(taskCard.getByText("Needs one final README and API pass", { exact: true })).toBeVisible();

  await taskCard.getByRole("button", { name: "Delete comment" }).click();
  await expect(taskCard.getByText("Needs one final README and API pass", { exact: true })).toHaveCount(0);

  await taskCard.getByRole("button", { name: "Delete task" }).click();
  await expect(
    alicePage.locator("article", {
      has: alicePage.getByRole("heading", { name: "Document release candidate" }),
    }),
  ).toHaveCount(0);

  await aliceContext.close();
});

test("kanban drag-and-drop reorders tasks across two browser contexts", async ({
  browser,
  request,
}) => {
  const todoTaskId = crypto.randomUUID();
  const progressTaskId = crypto.randomUUID();
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Kanban Demo",
      clientId: "client_alice",
      userId: "alice",
    },
  });
  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  await request.post(`/api/projects/${projectId}/events`, {
    data: {
      id: crypto.randomUUID(),
      entityId: todoTaskId,
      clientId: "client_seed",
      userId: "alice",
      timestamp: baseTimestamp,
      expectedVersion: 1,
      action: {
        type: "task.create",
        data: {
          title: "Ship board view",
          status: "todo",
          projectId,
          position: 1,
        },
      },
    },
  });
  await request.post(`/api/projects/${projectId}/events`, {
    data: {
      id: crypto.randomUUID(),
      entityId: progressTaskId,
      clientId: "client_seed",
      userId: "alice",
      timestamp: baseTimestamp + 1,
      expectedVersion: 2,
      action: {
        type: "task.create",
        data: {
          title: "Verify optimistic reorder",
          status: "in_progress",
          projectId,
          position: 2,
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

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await alicePage.goto(`/projects/${projectId}`);
  await bobPage.goto(`/projects/${projectId}`);

  await alicePage.getByRole("button", { name: "Board view" }).click();
  await bobPage.getByRole("button", { name: "Board view" }).click();

  await alicePage.dragAndDrop(
    `[data-task-id="${todoTaskId}"]`,
    '[data-column-status="in_progress"] [data-dropzone="end"]',
  );

  const aliceProgressColumn = alicePage.locator('[data-column-status="in_progress"]');
  const bobProgressColumn = bobPage.locator('[data-column-status="in_progress"]');

  await expect(aliceProgressColumn.getByText("Ship board view")).toBeVisible();
  await expect(bobProgressColumn.getByText("Ship board view")).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});

test("benchmark projects load task windows incrementally and virtualize the visible list", async ({
  page,
}) => {
  const { seedScaleProject } = await import("../../src/server/demo-seeds");
  const seeded = await seedScaleProject({
    taskCount: 64,
    baseUrl: "http://127.0.0.1:3010",
  });

  await page.goto(`/projects/${seeded.projectId}`);

  await expect(page.getByRole("heading", { name: seeded.projectName })).toBeVisible();
  await expect(page.getByText("Showing 32 of 64 tasks")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Task 00001" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Task 00064" })).toHaveCount(0);

  const taskWindow = page.locator(".virtual-task-list");
  await taskWindow.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });

  await expect(page.getByText(/64 tasks · version/i)).toBeVisible();
  await expect(page.getByText("48 prerequisite candidates.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Task 00029" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Task 00001" })).toHaveCount(0);
});

test("workspace reflows cleanly on tablet-width viewports", async ({
  browser,
  request,
}) => {
  const createProjectResponse = await request.post("/api/projects", {
    data: {
      name: "Tablet Layout Demo",
      clientId: "client_tablet",
      userId: "alice",
    },
  });
  expect(createProjectResponse.ok()).toBeTruthy();
  const { projectId } = (await createProjectResponse.json()) as { projectId: string };

  for (const viewport of [
    { width: 820, height: 1180 },
    { width: 900, height: 1180 },
    { width: 1024, height: 1280 },
  ]) {
    const context = await browser.newContext({
      viewport,
    });
    await context.addInitScript((identity) => {
      window.localStorage.setItem("collab-task-system.client-id", identity.clientId);
      window.localStorage.setItem("collab-task-system.display-name", identity.displayName);
    }, {
      clientId: `client_tablet_${viewport.width}`,
      displayName: "alice",
    });

    const page = await context.newPage();
    await page.goto(`/projects/${projectId}`);

    await expect(page.locator(".status-pill")).toHaveText("Live");

    const layout = await page.evaluate(() => {
      const body = document.querySelector(".workspace-body");
      const headerStack = document.querySelector(".header-stack");
      const headerControls = document.querySelector(".header-controls");
      const workspaceMain = document.querySelector(".workspace-main");
      const activityPanel = document.querySelector(".activity-panel");
      const taskForm = document.querySelector(".task-form");

      if (!body || !headerStack || !headerControls || !workspaceMain || !activityPanel || !taskForm) {
        throw new Error("Expected workspace layout nodes to be present.");
      }

      const bodyStyle = window.getComputedStyle(body);
      const formStyle = window.getComputedStyle(taskForm);
      const headerStackRect = headerStack.getBoundingClientRect();
      const headerControlsRect = headerControls.getBoundingClientRect();
      const workspaceMainRect = workspaceMain.getBoundingClientRect();
      const activityPanelRect = activityPanel.getBoundingClientRect();

      return {
        bodyColumns: bodyStyle.gridTemplateColumns,
        formColumns: formStyle.gridTemplateColumns,
        hasHorizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        activityBelowMain: activityPanelRect.top >= workspaceMainRect.bottom - 1,
        headerControlsBelowTitle: headerControlsRect.top >= headerStackRect.bottom - 1,
      };
    });

    expect(layout.hasHorizontalOverflow).toBeFalsy();
    expect(layout.activityBelowMain).toBeTruthy();
    expect(layout.headerControlsBelowTitle).toBeTruthy();
    expect(layout.bodyColumns.trim().split(/\s+/)).toHaveLength(1);
    expect(layout.formColumns.trim().split(/\s+/)).toHaveLength(1);

    await context.close();
  }
});
