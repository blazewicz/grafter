import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Project, Settings } from '../shared/contracts';
import { defaultSettings, normalizeSettings } from '../shared/settings';

export interface PersistedState {
  projects: Project[];
  settings: Settings;
}

const initialState: PersistedState = {
  projects: [],
  settings: defaultSettings,
};

interface StateStoreOptions {
  persist?: (file: string, state: PersistedState) => Promise<void>;
}

export class StateStore {
  readonly #file: string;
  readonly #persist: (file: string, state: PersistedState) => Promise<void>;
  #state: PersistedState = structuredClone(initialState);
  #updateTail: Promise<void> = Promise.resolve();

  constructor(userDataPath: string, options: StateStoreOptions = {}) {
    this.#file = path.join(userDataPath, 'grafter-state.json');
    this.#persist = options.persist ?? persistState;
  }

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(
        await readFile(this.#file, 'utf8'),
      ) as Partial<PersistedState>;
      this.#state = {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        settings: normalizeSettings(parsed.settings),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  get state(): PersistedState {
    return structuredClone(this.#state);
  }

  async update(mutator: (state: PersistedState) => void): Promise<void> {
    const transaction = this.#updateTail.then(async () => {
      const draft = structuredClone(this.#state);
      mutator(draft);
      await this.#persist(this.#file, draft);
      this.#state = draft;
    });
    this.#updateTail = transaction.catch(() => undefined);
    return transaction;
  }
}

async function persistState(file: string, state: PersistedState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}
