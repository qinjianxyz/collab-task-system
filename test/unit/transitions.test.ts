import { describe, expect, it } from "vitest";

import { InvalidStatusTransitionError } from "../../src/server/domain/errors";
import { assertTaskStatusTransitionAllowed } from "../../src/server/domain/transitions";

describe("assertTaskStatusTransitionAllowed", () => {
  it("throws when moving to in_progress with incomplete dependencies", () => {
    expect(() =>
      assertTaskStatusTransitionAllowed("in_progress", ["done", "todo"]),
    ).toThrow(InvalidStatusTransitionError);
  });

  it("surfaces the first blocking dependency title when available", () => {
    expect(() =>
      assertTaskStatusTransitionAllowed("in_progress", [
        { status: "done", title: "Ship auth" },
        { status: "todo", title: "Fix auth" },
      ]),
    ).toThrowError('Blocked: dependency "Fix auth" must be completed first.');
  });

  it("allows moving to in_progress when dependencies are done", () => {
    expect(() =>
      assertTaskStatusTransitionAllowed("in_progress", ["done", "done"]),
    ).not.toThrow();
  });

  it("allows non in_progress transitions without dependency gating", () => {
    expect(() =>
      assertTaskStatusTransitionAllowed("done", ["todo", "in_progress"]),
    ).not.toThrow();
  });
});
