"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

type VirtualTaskListProps<TItem> = {
  estimateItemHeight?: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  items: TItem[];
  onLoadMore: () => Promise<void>;
  overscan?: number;
  renderItem: (item: TItem) => ReactNode;
};

const DEFAULT_ITEM_HEIGHT = 280;
const DEFAULT_OVERSCAN = 3;
const VIEWPORT_HEIGHT = 720;
const LOAD_MORE_THRESHOLD = 4;

export function VirtualTaskList<TItem>({
  estimateItemHeight = DEFAULT_ITEM_HEIGHT,
  hasMore,
  isLoadingMore,
  items,
  onLoadMore,
  overscan = DEFAULT_OVERSCAN,
  renderItem,
}: VirtualTaskListProps<TItem>) {
  const [scrollTop, setScrollTop] = useState(0);

  const windowedRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / estimateItemHeight) - overscan);
    const visibleCount = Math.ceil(VIEWPORT_HEIGHT / estimateItemHeight) + overscan * 2;
    const endIndex = Math.min(items.length, startIndex + visibleCount);

    return {
      endIndex,
      startIndex,
    };
  }, [estimateItemHeight, items.length, overscan, scrollTop]);

  useEffect(() => {
    if (!hasMore || isLoadingMore) {
      return;
    }

    if (windowedRange.endIndex < items.length - LOAD_MORE_THRESHOLD) {
      return;
    }

    void onLoadMore();
  }, [hasMore, isLoadingMore, items.length, onLoadMore, windowedRange.endIndex]);

  const visibleItems = items.slice(windowedRange.startIndex, windowedRange.endIndex);
  const offsetTop = windowedRange.startIndex * estimateItemHeight;
  const totalHeight = Math.max(items.length * estimateItemHeight, VIEWPORT_HEIGHT);

  return (
    <div
      className="virtual-task-list"
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop);
      }}
    >
      <div className="virtual-task-spacer" style={{ height: `${totalHeight}px` }}>
        <div
          className="virtual-task-window"
          style={{ transform: `translateY(${offsetTop}px)` }}
        >
          {visibleItems.map((item, index) => (
            <div
              className="virtual-task-row"
              key={windowedRange.startIndex + index}
              style={{ minHeight: `${estimateItemHeight}px` }}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      </div>

      {isLoadingMore ? (
        <p className="subtle-copy virtual-task-status">Loading more tasks…</p>
      ) : hasMore ? (
        <p className="subtle-copy virtual-task-status">
          Scroll to load the next task window.
        </p>
      ) : null}
    </div>
  );
}
