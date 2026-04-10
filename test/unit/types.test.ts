import { describe, expect, it } from "vitest";

import { appendEventInputSchema } from "../../src/shared/types";

describe("appendEventInputSchema", () => {
  it("rejects an append command without expectedVersion", () => {
    const result = appendEventInputSchema.safeParse({
      id: "evt_1",
      projectId: "project_1",
      entityId: "project_1",
      action: {
        type: "project.create",
        data: {
          name: "Project 1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: Date.now(),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid append command", () => {
    const result = appendEventInputSchema.safeParse({
      id: "evt_1",
      projectId: "project_1",
      entityId: "project_1",
      action: {
        type: "project.create",
        data: {
          name: "Project 1",
        },
      },
      clientId: "client_1",
      userId: "user_1",
      timestamp: Date.now(),
      expectedVersion: 0,
    });

    expect(result.success).toBe(true);
  });
});
