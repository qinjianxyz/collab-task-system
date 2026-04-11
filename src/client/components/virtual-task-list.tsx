"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

type VirtualWindowInput = {
  estimatedItemHeight: number;
  itemCount: number;
  overscan: number;
  scrollTop: number;
  smallListThreshold: number;
  viewportHeight: number;
};

type NextPageRequestInput = {
  hasMore: boolean;
  isLoadingMore: boolean;
  loadedCount: number;
  threshold: number;
  visibleEndIndex: number;
};

type VirtualTaskListProps<T> = {
  className?: string;
  emptyState?: ReactNode;
  estimatedItemHeight?: number;
  getKey: (item: T) => string;
  hasMore: boolean;
  isLoadingMore: boolean;
  items: T[];
  loadMoreLabel?: string;
  loadMoreThreshold?: number;
  onLoadMore: () => Promise<void> | void;
  overscan?: number;
  renderItem: (item: T) => ReactNode;
  smallListThreshold?: number;
  viewportLabel?: string;
};

const DEFAULT_ESTIMATED_ITEM_HEIGHT = 232;
const DEFAULT_OVERSCAN = 3;
const DEFAULT_SMALL_LIST_THRESHOLD = 12;
const DEFAULT_LOAD_MORE_THRESHOLD = 8;
const DEFAULT_VIEWPORT_HEIGHT = 720;

export function computeVirtualWindow({
  estimatedItemHeight,
  itemCount,
  overscan,
  scrollTop,
  smallListThreshold,
  viewportHeight,
}: VirtualWindowInput): {
  endIndex: number;
  startIndex: number;
} {
  if (itemCount <= smallListThreshold) {
    return {
      startIndex: 0,
      endIndex: itemCount,
    };
  }

  const safeViewportHeight = Math.max(viewportHeight, estimatedItemHeight);
  const firstVisibleIndex = Math.floor(scrollTop / estimatedItemHeight);
  const visibleCount = Math.max(1, Math.ceil(safeViewportHeight / estimatedItemHeight));
  const startIndex = Math.max(0, firstVisibleIndex - overscan);
  const endIndex = Math.min(itemCount, firstVisibleIndex + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
  };
}

export function shouldRequestNextTaskPage({
  hasMore,
  isLoadingMore,
  loadedCount,
  threshold,
  visibleEndIndex,
}: NextPageRequestInput): boolean {
  if (!hasMore || isLoadingMore || loadedCount === 0) {
    return false;
  }

  return visibleEndIndex >= Math.max(0, loadedCount - threshold);
}

export function VirtualTaskList<T>({
  className,
  emptyState = null,
  estimatedItemHeight = DEFAULT_ESTIMATED_ITEM_HEIGHT,
  getKey,
  hasMore,
  isLoadingMore,
  items,
  loadMoreLabel = "Load more tasks",
  loadMoreThreshold = DEFAULT_LOAD_MORE_THRESHOLD,
  onLoadMore,
  overscan = DEFAULT_OVERSCAN,
  renderItem,
  smallListThreshold = DEFAULT_SMALL_LIST_THRESHOLD,
  viewportLabel = "Task list",
}: VirtualTaskListProps<T>) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const syncViewport = () => {
      setScrollTop(viewport.scrollTop);
      setViewportHeight(viewport.clientHeight || DEFAULT_VIEWPORT_HEIGHT);
    };

    syncViewport();
    viewport.addEventListener("scroll", syncViewport, {
      passive: true,
    });
    window.addEventListener("resize", syncViewport);

    return () => {
      viewport.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [items.length]);

  const { startIndex, endIndex } = useMemo(
    () =>
      computeVirtualWindow({
        estimatedItemHeight,
        itemCount: items.length,
        overscan,
        scrollTop,
        smallListThreshold,
        viewportHeight,
      }),
    [estimatedItemHeight, items.length, overscan, scrollTop, smallListThreshold, viewportHeight],
  );

  useEffect(() => {
    if (
      shouldRequestNextTaskPage({
        hasMore,
        isLoadingMore,
        loadedCount: items.length,
        threshold: loadMoreThreshold,
        visibleEndIndex: endIndex,
      })
    ) {
      void onLoadMore();
    }
  }, [endIndex, hasMore, isLoadingMore, items.length, loadMoreThreshold, onLoadMore]);

  if (items.length === 0) {
    return <>{emptyState}</>;
  }

  const usesWindowing = items.length > smallListThreshold;
  const visibleItems = items.slice(startIndex, endIndex);
  const topPadding = usesWindowing ? startIndex * estimatedItemHeight : 0;
  const bottomPadding = usesWindowing
    ? Math.max(0, (items.length - endIndex) * estimatedItemHeight)
    : 0;

  return (
    <div className={className}>
      <div
        aria-label={viewportLabel}
        aria-busy={isLoadingMore ? "true" : "false"}
        className={`task-list-viewport${usesWindowing ? " is-windowed" : ""}`}
        ref={viewportRef}
        role="list"
      >
        <div className="task-list-window">
          {topPadding > 0 ? (
            <div
              aria-hidden="true"
              className="task-list-spacer"
              style={{ height: `${topPadding}px` }}
            />
          ) : null}

          {visibleItems.map((item) => (
            <div key={getKey(item)} role="listitem">
              {renderItem(item)}
            </div>
          ))}

          {bottomPadding > 0 ? (
            <div
              aria-hidden="true"
              className="task-list-spacer"
              style={{ height: `${bottomPadding}px` }}
            />
          ) : null}
        </div>
      </div>

      {hasMore ? (
        <div className="task-list-footer">
          <button
            className="secondary-button"
            disabled={isLoadingMore}
            onClick={() => {
              void onLoadMore();
            }}
            type="button"
          >
            {isLoadingMore ? "Loading more..." : loadMoreLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
