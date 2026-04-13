type SseController = {
  close: () => void;
  desiredSize: number | null;
  enqueue: (chunk: Uint8Array) => void;
};

type SseBufferOptions = {
  controller: SseController;
  maxBufferedEvents?: number;
  onOverflow?: () => void;
};

const DEFAULT_MAX_BUFFERED_EVENTS = 64;
const BACKPRESSURE_RETRY_MS = 16;

function encodeSse(eventName: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export function createSseBuffer(options: SseBufferOptions) {
  const maxBufferedEvents = options.maxBufferedEvents ?? DEFAULT_MAX_BUFFERED_EVENTS;
  const pending: Uint8Array[] = [];
  let closed = false;
  let flushScheduled = false;
  let retryTimeout: ReturnType<typeof setTimeout> | undefined;

  function scheduleRetry(): void {
    if (closed || retryTimeout) {
      return;
    }

    retryTimeout = setTimeout(() => {
      retryTimeout = undefined;
      flush();
    }, BACKPRESSURE_RETRY_MS);
  }

  function close(): void {
    if (closed) {
      return;
    }

    closed = true;
    pending.length = 0;
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = undefined;
    }

    try {
      options.controller.close();
    } catch {
      // stream already closed
    }
  }

  function flush(): void {
    flushScheduled = false;

    if (closed) {
      pending.length = 0;
      return;
    }

    while (pending.length > 0) {
      const desiredSize = options.controller.desiredSize;
      if (desiredSize !== null && desiredSize <= 0) {
        scheduleRetry();
        return;
      }

      const chunk = pending.shift();
      if (!chunk) {
        return;
      }

      try {
        options.controller.enqueue(chunk);
      } catch {
        close();
        return;
      }
    }
  }

  function scheduleFlush(): void {
    if (flushScheduled || closed) {
      return;
    }

    flushScheduled = true;
    queueMicrotask(flush);
  }

  function enqueue(eventName: string, data: unknown): void {
    if (closed) {
      return;
    }

    pending.push(encodeSse(eventName, data));
    if (pending.length > maxBufferedEvents) {
      options.onOverflow?.();
      close();
      return;
    }

    scheduleFlush();
  }

  return {
    close,
    enqueue,
  };
}
