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
