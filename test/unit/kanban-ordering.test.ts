import { describe, expect, it } from "vitest";

import { getReorderedPosition } from "../../src/client/kanban/position";

describe("Kanban ordering helpers", () => {
  it("returns the midpoint between surrounding tasks", () => {
    expect(getReorderedPosition(10, 20)).toBe(15);
  });

  it("places tasks before the first card in a column", () => {
    expect(getReorderedPosition(undefined, 10)).toBe(9);
  });

  it("places tasks after the last card in a column", () => {
    expect(getReorderedPosition(10, undefined)).toBe(11);
  });

  it("starts a new column at position 1", () => {
    expect(getReorderedPosition(undefined, undefined)).toBe(1);
  });
});
