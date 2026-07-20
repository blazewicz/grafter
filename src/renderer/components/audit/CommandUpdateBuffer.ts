import type { CommandRecord } from '../../../shared/contracts';

export const commandUpdateBufferMs = 100;

export interface CommandUpdateScheduler {
  schedule(callback: () => void, delayMs: number): number;
  cancel(handle: number): void;
}

interface PendingCommandUpdate {
  record: CommandRecord;
  timeout: number;
}

export class CommandUpdateBuffer {
  readonly #pending = new Map<string, PendingCommandUpdate>();

  constructor(
    private readonly flush: (record: CommandRecord) => void,
    private readonly scheduler: CommandUpdateScheduler,
    private readonly delayMs = commandUpdateBufferMs,
  ) {}

  enqueue(record: CommandRecord): void {
    const pending = this.#pending.get(record.id);

    if (record.status === 'awaiting-approval' || record.status === 'failed') {
      if (pending) {
        this.scheduler.cancel(pending.timeout);
        this.#pending.delete(record.id);
      }
      this.flush(record);
      return;
    }

    if (pending) {
      pending.record = record;
      return;
    }

    const timeout = this.scheduler.schedule(() => {
      const latest = this.#pending.get(record.id);
      if (!latest) return;
      this.#pending.delete(record.id);
      this.flush(latest.record);
    }, this.delayMs);
    this.#pending.set(record.id, { record, timeout });
  }

  dispose(): void {
    for (const pending of this.#pending.values()) {
      this.scheduler.cancel(pending.timeout);
    }
    this.#pending.clear();
  }
}
