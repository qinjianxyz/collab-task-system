import { describe, expect, it } from "vitest";

import { detectDependencyCycle } from "../../src/server/domain/dependencies";

describe("detectDependencyCycle", () => {
  it("returns false when the dependency graph stays acyclic", () => {
    const hasCycle = detectDependencyCycle(
      {
        task_1: ["task_2"],
        task_2: [],
      },
      "task_2",
      [],
    );

    expect(hasCycle).toBe(false);
  });

  it("returns true for a direct cycle", () => {
    const hasCycle = detectDependencyCycle(
      {
        task_1: ["task_2"],
        task_2: [],
      },
      "task_2",
      ["task_1"],
    );

    expect(hasCycle).toBe(true);
  });

  it("returns true for an indirect cycle", () => {
    const hasCycle = detectDependencyCycle(
      {
        task_1: ["task_2"],
        task_2: ["task_3"],
        task_3: [],
      },
      "task_3",
      ["task_1"],
    );

    expect(hasCycle).toBe(true);
  });
});
