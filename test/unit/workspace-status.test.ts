import { describe, expect, it } from "vitest";

import { buildWorkspaceStatusViewModel } from "../../src/client/components/workspace-status";

describe("buildWorkspaceStatusViewModel", () => {
  it("describes the steady connected state", () => {
    expect(
      buildWorkspaceStatusViewModel({
        connectionStatus: "connected",
        error: null,
        isMutating: false,
      }),
    ).toEqual({
      detail: "Changes sync in real time over the committed event stream.",
      label: "Live",
      showRetry: false,
      tone: "positive",
    });
  });

  it("surfaces an in-flight mutation as syncing", () => {
    expect(
      buildWorkspaceStatusViewModel({
        connectionStatus: "connected",
        error: null,
        isMutating: true,
      }),
    ).toEqual({
      detail: "Saving the latest change to the event stream.",
      label: "Syncing",
      showRetry: false,
      tone: "neutral",
    });
  });

  it("surfaces reconnecting state with retry guidance", () => {
    expect(
      buildWorkspaceStatusViewModel({
        connectionStatus: "reconnecting",
        error: "network timeout",
        isMutating: false,
      }),
    ).toEqual({
      detail: "Trying to restore the live stream. Missed events will catch up automatically.",
      label: "Reconnecting",
      showRetry: true,
      tone: "warning",
    });
  });

  it("describes the initial loading state", () => {
    expect(
      buildWorkspaceStatusViewModel({
        connectionStatus: "loading",
        error: null,
        isMutating: false,
      }),
    ).toEqual({
      detail: "Fetching the latest snapshot and opening the live stream.",
      label: "Loading",
      showRetry: false,
      tone: "neutral",
    });
  });
});
