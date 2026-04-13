import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closeDatabasePool, getDatabasePool } from "../../src/server/db/client";
import { resetDatabase, waitForDatabase } from "../../src/server/db/testing";
import {
  seedDemoProject,
  seedScaleProject,
} from "../../src/server/demo-seeds";

describe("demo seed builders", () => {
  beforeAll(async () => {
    await waitForDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it("creates a realistic demo project with meaningful task dependencies and comments", async () => {
    const seeded = await seedDemoProject();

    const projectResult = await getDatabasePool().query<{
      name: string;
      current_version: number;
    }>("select name, current_version from projects where id = $1", [seeded.projectId]);

    const taskResult = await getDatabasePool().query<{
      id: string;
      title: string;
      status: string;
      dependencies: string[] | null;
    }>(
      "select id, title, status, dependencies from tasks where project_id = $1 order by position asc",
      [seeded.projectId],
    );

    const commentResult = await getDatabasePool().query<{ count: string }>(
      "select count(*)::text as count from comments where task_id in (select id from tasks where project_id = $1)",
      [seeded.projectId],
    );

    expect(projectResult.rows[0]?.name).toBe("Ship Collab Task System");
    expect(taskResult.rows.length).toBeGreaterThanOrEqual(18);
    expect(taskResult.rows.map((task) => task.title)).toContain("Ship the two-tab demo");
    expect(taskResult.rows.map((task) => task.title)).toContain("Run evaluator dry run");
    expect(taskResult.rows.some((task) => (task.dependencies ?? []).length > 0)).toBe(true);
    expect(commentResult.rows[0]?.count).not.toBe("0");
    expect(seeded.url).toContain(`/projects/${seeded.projectId}`);
  }, 20_000);

  it("creates a large benchmark project with stable ordering and the requested size", async () => {
    const taskCount = 120;
    const seeded = await seedScaleProject({
      taskCount,
      baseUrl: "http://localhost:8100",
    });

    const taskCountResult = await getDatabasePool().query<{ count: string }>(
      "select count(*)::text as count from tasks where project_id = $1",
      [seeded.projectId],
    );
    const edgeResult = await getDatabasePool().query<{
      first_title: string;
      last_title: string;
      max_position: number;
    }>(
      `select
          min(title) filter (where position = 1) as first_title,
          min(title) filter (where position = $2) as last_title,
          max(position)::int as max_position
        from tasks
        where project_id = $1`,
      [seeded.projectId, taskCount],
    );

    expect(seeded.taskCount).toBe(taskCount);
    expect(taskCountResult.rows[0]?.count).toBe(String(taskCount));
    expect(edgeResult.rows[0]?.max_position).toBe(taskCount);
    expect(edgeResult.rows[0]?.first_title).toBe("Demo Task 00001");
    expect(edgeResult.rows[0]?.last_title).toBe("Demo Task 00120");
  }, 45_000);
});
