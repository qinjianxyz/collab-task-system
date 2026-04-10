import { describe, expect, it } from "vitest";

import { packageName } from "../../src/index";

describe("workspace barrel", () => {
  it("exports the package marker", () => {
    expect(packageName).toBe("@enterprise-os/collab-task-system");
  });
});
