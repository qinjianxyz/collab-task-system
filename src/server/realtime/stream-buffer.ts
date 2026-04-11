type StreamBufferOptions<T> = {
  maxSize: number;
  onOverflow: () => void;
  onWrite: (value: T) => boolean;
  retryDelayMs?: number;
};

export class StreamBuffer<T> {
  private closed = false;

  private flushScheduled = false;

  private readonly queue: T[] = [];

  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: StreamBufferOptions<T>) {}

  push(value: T): boolean {
    if (this.closed) {
      return false;
    }

    if (this.queue.length >= this.options.maxSize) {
      this.closed = true;
      this.clearRetry();
      this.options.onOverflow();
      return false;
    }

    this.queue.push(value);
    this.scheduleFlush();
    return true;
  }

  close(): void {
    this.closed = true;
    this.clearRetry();
    this.queue.length = 0;
  }

  get size(): number {
    return this.queue.length;
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private flush(): void {
    this.flushScheduled = false;

    if (this.closed) {
      return;
    }

    while (this.queue.length > 0) {
      const nextValue = this.queue[0]!;
      const wrote = this.options.onWrite(nextValue);

      if (!wrote) {
        this.scheduleRetry();
        return;
      }

      this.queue.shift();
    }
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.closed) {
      return;
    }

    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flush();
    });
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.closed) {
      return;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.scheduleFlush();
    }, this.options.retryDelayMs ?? 25);
  }
}
