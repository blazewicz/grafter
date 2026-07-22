interface QueuedTask<T> {
  task: () => PromiseLike<T> | T;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

/** A small FIFO limiter for main-process work that must remain bounded across calls. */
export class TaskLimiter {
  readonly #concurrency: number;
  readonly #queue: QueuedTask<unknown>[] = [];
  #activeCount = 0;

  constructor(concurrency: number) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error('Limiter concurrency must be a positive integer.');
    }
    this.#concurrency = concurrency;
  }

  run<T>(task: () => PromiseLike<T> | T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#queue.push({
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.#startNext();
    });
  }

  #startNext(): void {
    while (this.#activeCount < this.#concurrency) {
      const queued = this.#queue.shift();
      if (!queued) return;
      this.#activeCount += 1;
      void Promise.resolve()
        .then(queued.task)
        .then(queued.resolve, queued.reject)
        .finally(() => {
          this.#activeCount -= 1;
          this.#startNext();
        });
    }
  }
}
