import { describe, expect, it } from "vitest";

import {
  decodeTaskCursor,
  encodeTaskCursor,
} from "../../src/server/projects/task-pagination";

describe("task cursor helpers", () => {
  it("round-trips a task cursor", () => {
    const encoded = encodeTaskCursor({
      id: "task_a",
      position: 42.5,
    });

    expect(decodeTaskCursor(encoded)).toEqual({
      id: "task_a",
      position: 42.5,
    });
  });

  it("rejects malformed task cursors", () => {
    expect(() => decodeTaskCursor("not-base64")).toThrowError(/cursor/i);
    expect(() =>
      decodeTaskCursor(Buffer.from(JSON.stringify({ id: "", position: "bad" })).toString("base64url")),
    ).toThrowError(/cursor/i);
  });
});
