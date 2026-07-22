import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import type { Project, Settings } from '../shared/contracts';
import { defaultSettings, normalizeSettings } from '../shared/settings';

export interface PersistedState {
  projects: Project[];
  settings: Settings;
  comparisonBaseOverrides: Record<string, { sourceBranch: string; targetBranch: string }>;
}

const initialState: PersistedState = {
  projects: [],
  settings: defaultSettings,
  comparisonBaseOverrides: {},
};

interface StateStoreOptions {
  persist?: (file: string, state: PersistedState) => Promise<void>;
}

export class StateStore {
  readonly #file: string;
  readonly #persist: (file: string, state: PersistedState) => Promise<void>;
  readonly #updateLimit = pLimit(1);
  #state: PersistedState = structuredClone(initialState);

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
        comparisonBaseOverrides: normalizeComparisonBaseOverrides(
          parsed.comparisonBaseOverrides,
        ),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  get state(): PersistedState {
    return structuredClone(this.#state);
  }

  async update(mutator: (state: PersistedState) => void): Promise<void> {
    return this.#updateLimit(async () => {
      const draft = structuredClone(this.#state);
      mutator(draft);
      await this.#persist(this.#file, draft);
      this.#state = draft;
    });
  }
}

function normalizeComparisonBaseOverrides(
  value: unknown,
): PersistedState['comparisonBaseOverrides'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const overrides = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(overrides).filter(
      (entry): entry is [string, { sourceBranch: string; targetBranch: string }] => {
        const override = entry[1];
        return (
          Boolean(entry[0]) &&
          Boolean(override) &&
          typeof override === 'object' &&
          !Array.isArray(override) &&
          typeof (override as Record<string, unknown>).sourceBranch === 'string' &&
          Boolean((override as Record<string, unknown>).sourceBranch) &&
          typeof (override as Record<string, unknown>).targetBranch === 'string' &&
          Boolean((override as Record<string, unknown>).targetBranch)
        );
      },
    ),
  );
}

async function persistState(file: string, state: PersistedState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}
