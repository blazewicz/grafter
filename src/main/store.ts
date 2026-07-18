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

export class StateStore {
  readonly #file: string;
  #state: PersistedState = structuredClone(initialState);

  constructor(userDataPath: string) {
    this.#file = path.join(userDataPath, 'grafter-state.json');
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
    mutator(this.#state);
    await mkdir(path.dirname(this.#file), { recursive: true });
    const temporary = `${this.#file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.#state, null, 2)}\n`, 'utf8');
    await rename(temporary, this.#file);
  }
}
