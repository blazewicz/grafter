interface GateWaiter {
  kind: 'read' | 'write';
  grant: () => void;
}

interface GateState {
  activeReaders: number;
  writerActive: boolean;
  queue: GateWaiter[];
}

export class KeyedOperationGate {
  readonly #states = new Map<string, GateState>();

  async read<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const release = await this.#acquire(key, 'read');
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async write<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const release = await this.#acquire(key, 'write');
    try {
      return await operation();
    } finally {
      release();
    }
  }

  #acquire(key: string, kind: 'read' | 'write'): Promise<() => void> {
    const state = this.#states.get(key) ?? {
      activeReaders: 0,
      writerActive: false,
      queue: [],
    };
    this.#states.set(key, state);

    const acquired = new Promise<() => void>((resolve) => {
      state.queue.push({
        kind,
        grant: () => {
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            if (kind === 'read') state.activeReaders -= 1;
            else state.writerActive = false;
            this.#drain(key, state);
          });
        },
      });
    });
    this.#drain(key, state);
    return acquired;
  }

  #drain(key: string, state: GateState): void {
    if (state.writerActive) return;
    const next = state.queue[0];
    if (!next) {
      if (state.activeReaders === 0 && this.#states.get(key) === state) {
        this.#states.delete(key);
      }
      return;
    }

    if (next.kind === 'write') {
      if (state.activeReaders > 0) return;
      state.queue.shift();
      state.writerActive = true;
      next.grant();
      return;
    }

    while (state.queue[0]?.kind === 'read' && !state.writerActive) {
      const read = state.queue.shift();
      if (read?.kind !== 'read') break;
      state.activeReaders += 1;
      read.grant();
    }
  }
}
