import { describe, expect, it } from "vitest";

import {
  computeVirtualWindow,
  shouldRequestNextTaskPage,
} from "../../src/client/components/virtual-task-list";

describe("virtual task list helpers", () => {
  it("keeps the initial render window bounded for large task collections", () => {
    const windowState = computeVirtualWindow({
      itemCount: 10_000,
      scrollTop: 0,
      viewportHeight: 720,
      estimatedItemHeight: 240,
      overscan: 3,
      smallListThreshold: 12,
    });

    expect(windowState.startIndex).toBe(0);
    expect(windowState.endIndex - windowState.startIndex).toBeLessThanOrEqual(12);
  });

  it("renders the full list when the collection is below the simple-list threshold", () => {
    const windowState = computeVirtualWindow({
      itemCount: 8,
      scrollTop: 0,
      viewportHeight: 720,
      estimatedItemHeight: 240,
      overscan: 3,
      smallListThreshold: 12,
    });

    expect(windowState).toEqual({
      startIndex: 0,
      endIndex: 8,
    });
  });

  it("requests the next task page when the visible window approaches the loaded boundary", () => {
    expect(
      shouldRequestNextTaskPage({
        hasMore: true,
        isLoadingMore: false,
        loadedCount: 100,
        threshold: 8,
        visibleEndIndex: 94,
      }),
    ).toBe(true);

    expect(
      shouldRequestNextTaskPage({
        hasMore: true,
        isLoadingMore: true,
        loadedCount: 100,
        threshold: 8,
        visibleEndIndex: 94,
      }),
    ).toBe(false);
  });
});
