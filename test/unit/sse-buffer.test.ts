import { describe, expect, it, vi } from "vitest";

import { createSseBuffer } from "../../src/server/realtime/sse-buffer";

type MockFn<T extends (...args: never[]) => unknown> = ReturnType<typeof vi.fn<T>> & T;

type FakeController = {
  close: MockFn<() => void>;
  desiredSize: number | null;
  enqueue: MockFn<(chunk: Uint8Array) => void>;
};

function createController(initialDesiredSize: number | null = 1): FakeController {
  return {
    close: vi.fn(),
    desiredSize: initialDesiredSize,
    enqueue: vi.fn(),
  };
}

function decodeChunks(controller: FakeController): string[] {
  return controller.enqueue.mock.calls.map(([chunk]) => new TextDecoder().decode(chunk));
}

describe("SSE buffer", () => {
  it("writes immediately when the stream has capacity", async () => {
    const controller = createController(1);
    const buffer = createSseBuffer({
      controller,
      maxBufferedEvents: 4,
    });

    buffer.enqueue("version", { version: 1 });
    await Promise.resolve();

    expect(decodeChunks(controller)).toEqual([
      'event: version\ndata: {"version":1}\n\n',
    ]);
  });

  it("buffers while backpressured and flushes once capacity returns", async () => {
    const controller = createController(0);
    const buffer = createSseBuffer({
      controller,
      maxBufferedEvents: 4,
    });

    buffer.enqueue("presence", { viewers: [] });
    await Promise.resolve();

    expect(controller.enqueue).not.toHaveBeenCalled();

    controller.desiredSize = 1;
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(decodeChunks(controller)).toEqual([
      'event: presence\ndata: {"viewers":[]}\n\n',
    ]);
  });

  it("closes the stream when buffered events exceed the configured limit", async () => {
    const controller = createController(-1);
    const onOverflow = vi.fn();
    const buffer = createSseBuffer({
      controller,
      maxBufferedEvents: 2,
      onOverflow,
    });

    buffer.enqueue("project-event", { id: "evt_1" });
    buffer.enqueue("project-event", { id: "evt_2" });
    buffer.enqueue("project-event", { id: "evt_3" });
    await Promise.resolve();

    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(controller.close).toHaveBeenCalledTimes(1);
  });
});
