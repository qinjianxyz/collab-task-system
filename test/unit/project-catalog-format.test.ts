import { describe, expect, it } from "vitest";

import { formatProjectUpdatedAt } from "../../src/client/project-catalog";

describe("formatProjectUpdatedAt", () => {
  it("renders a hydration-safe UTC timestamp string", () => {
    expect(formatProjectUpdatedAt(1_716_000_000_000)).toBe("May 18, 2024, 2:40 AM UTC");
  });
});
