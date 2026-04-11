import { describe, expect, it, vi } from "vitest";

import { StreamBuffer } from "../../src/server/realtime/stream-buffer";

describe("stream buffer", () => {
  it("closes the stream when the bounded queue overflows", () => {
    const onOverflow = vi.fn();
    const buffer = new StreamBuffer<string>({
      maxSize: 2,
      onOverflow,
      onWrite: () => false,
      retryDelayMs: 1,
    });

    expect(buffer.push("first")).toBe(true);
    expect(buffer.push("second")).toBe(true);
    expect(buffer.push("third")).toBe(false);
    expect(onOverflow).toHaveBeenCalledTimes(1);
  });

  it("flushes buffered messages in order once the consumer catches up", async () => {
    vi.useFakeTimers();

    let writable = false;
    const written: string[] = [];
    const buffer = new StreamBuffer<string>({
      maxSize: 4,
      onOverflow: vi.fn(),
      onWrite: (value) => {
        if (!writable) {
          return false;
        }

        written.push(value);
        return true;
      },
      retryDelayMs: 5,
    });

    buffer.push("first");
    buffer.push("second");

    await Promise.resolve();
    expect(written).toEqual([]);

    writable = true;
    await vi.advanceTimersByTimeAsync(5);

    expect(written).toEqual(["first", "second"]);

    vi.useRealTimers();
  });
});
