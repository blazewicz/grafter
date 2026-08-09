import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import type {
  ProjectConfig,
  RecentRepository,
  Settings,
  ToolPickerGroup,
} from '../shared/contracts';
import { defaultSettings, normalizeSettings } from '../shared/settings';
import {
  defaultToolPreferences,
  isToolPickerGroup,
  normalizeToolPreference,
  normalizeToolPreferences,
} from '../shared/tool-preferences';

export const currentStateSchemaVersion = 2;

export interface ComparisonBaseOverride {
  sourceBranch: string;
  targetBranch: string;
}

export interface RepositoryPreferences {
  setupScript?: string;
  comparisonBaseOverrides: Record<string, ComparisonBaseOverride>;
}

/** The normalized schema used by the runtime and every new state-file write. */
export interface PersistedState {
  schemaVersion: typeof currentStateSchemaVersion;
  settings: Settings;
  recentRepositories: RecentRepository[];
  repositoryPreferences: Record<string, RepositoryPreferences>;
  toolPreferences: Record<ToolPickerGroup, string>;
}

const initialState: PersistedState = {
  schemaVersion: currentStateSchemaVersion,
  settings: defaultSettings,
  recentRepositories: [],
  repositoryPreferences: {},
  toolPreferences: defaultToolPreferences(),
};

interface StateStoreOptions {
  persist?: (file: string, state: PersistedState) => Promise<void>;
  now?: () => number;
}

export class StateStore {
  readonly #file: string;
  readonly #persist: (file: string, state: PersistedState) => Promise<void>;
  readonly #now: () => number;
  readonly #updateLimit = pLimit(1);
  #state: PersistedState = structuredClone(initialState);

  constructor(userDataPath: string, options: StateStoreOptions = {}) {
    this.#file = path.join(userDataPath, 'grafter-state.json');
    this.#persist = options.persist ?? persistState;
    this.#now = options.now ?? Date.now;
  }

  async load(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#file, 'utf8'));
      this.#state = normalizePersistedState(parsed, this.#now());
    } catch (error) {
      if (isFileNotFoundError(error)) return;
      throw error;
    }
  }

  get state(): PersistedState {
    return structuredClone(this.#state);
  }

  async update(mutator: (state: PersistedState) => void): Promise<void> {
    return this.#updateLimit(async () => {
      const draft = structuredClone(this.#state);
      mutator(draft);
      draft.schemaVersion = currentStateSchemaVersion;
      draft.recentRepositories = deduplicateAndSortRecents(draft.recentRepositories);
      await this.#persist(this.#file, draft);
      this.#state = draft;
    });
  }

  async addRepository(
    repository: ProjectConfig,
    lastOpenedPath = repository.path,
    commonDirectoryPath?: string,
  ): Promise<void> {
    await this.update((state) => {
      upsertRecentRepository(
        state,
        repository,
        lastOpenedPath,
        this.#now(),
        commonDirectoryPath,
      );
      const preferences = ensureRepositoryPreferences(state, repository.id);
      if (repository.setupScript && !preferences.setupScript) {
        preferences.setupScript = repository.setupScript;
      }
    });
  }

  async openRepository(
    repositoryId: string,
    lastOpenedPath: string,
    commonDirectoryPath?: string,
  ): Promise<void> {
    await this.update((state) => {
      const recent = state.recentRepositories.find(
        (candidate) => candidate.repositoryId === repositoryId,
      );
      if (!recent) throw new Error('Repository not found.');
      upsertRecentRepository(
        state,
        {
          id: recent.repositoryId,
          name: recent.name,
          path: recent.mainWorktreePath,
        },
        lastOpenedPath,
        this.#now(),
        commonDirectoryPath ?? recent.commonDirectoryPath,
      );
    });
  }

  repositorySetupScript(repositoryId: string): string | undefined {
    return this.#state.repositoryPreferences[repositoryId]?.setupScript;
  }

  async setRepositorySetupScript(
    repositoryId: string,
    setupScript: string | undefined,
  ): Promise<void> {
    await this.update((state) => {
      assertKnownRepository(state, repositoryId);
      const preferences = ensureRepositoryPreferences(state, repositoryId);
      const normalizedScript = normalizeNonEmptyString(setupScript);
      if (normalizedScript) preferences.setupScript = normalizedScript;
      else delete preferences.setupScript;
    });
  }

  comparisonBaseOverride(
    repositoryId: string,
    worktreeId: string,
  ): ComparisonBaseOverride | undefined {
    const override =
      this.#state.repositoryPreferences[repositoryId]?.comparisonBaseOverrides[
        worktreeId
      ];
    return override ? structuredClone(override) : undefined;
  }

  async setComparisonBaseOverride(
    repositoryId: string,
    worktreeId: string,
    override: ComparisonBaseOverride | undefined,
  ): Promise<void> {
    await this.update((state) => {
      assertKnownRepository(state, repositoryId);
      const preferences = ensureRepositoryPreferences(state, repositoryId);
      if (override) preferences.comparisonBaseOverrides[worktreeId] = override;
      else delete preferences.comparisonBaseOverrides[worktreeId];
    });
  }

  toolPreference(group: ToolPickerGroup): string {
    return this.#state.toolPreferences[group];
  }

  async setToolPreference(group: ToolPickerGroup, tool: string): Promise<void> {
    if (!isToolPickerGroup(group)) throw new Error('Invalid tool picker group.');
    const normalized = normalizeToolPreference(group, tool);
    if (!normalized) throw new Error('Invalid tool preference.');
    await this.update((state) => {
      state.toolPreferences[group] = normalized;
    });
  }
}

/**
 * Accepts both the normalized schema and the last pre-migration project-based shapes.
 * Legacy fields are consumed here and are deliberately absent from the returned state.
 */
export function normalizePersistedState(value: unknown, now: number): PersistedState {
  if (!isRecord(value)) return structuredClone(initialState);
  const schemaVersion = normalizeSchemaVersion(value.schemaVersion);
  if (schemaVersion > currentStateSchemaVersion) {
    throw new Error(
      `State schema version ${schemaVersion} is newer than this version of Grafter supports.`,
    );
  }

  const legacyProjects = normalizeProjects(value.projects);
  const recentRepositories = reconcileProjectRecents(
    legacyProjects,
    normalizeRecentRepositories(value.recentRepositories, now),
    now,
  );
  const repositoryPreferences = normalizeRepositoryPreferences(
    value.repositoryPreferences,
  );
  migrateLegacyPreferences(
    legacyProjects,
    normalizeComparisonBaseOverrides(value.comparisonBaseOverrides),
    repositoryPreferences,
  );

  return {
    schemaVersion: currentStateSchemaVersion,
    settings: normalizeSettings(value.settings),
    recentRepositories,
    repositoryPreferences,
    toolPreferences: normalizeToolPreferences(value.toolPreferences),
  };
}

function normalizeSchemaVersion(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function normalizeProjects(value: unknown): ProjectConfig[] {
  if (!Array.isArray(value)) return [];
  const projects: ProjectConfig[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const candidate of value) {
    const project = normalizeProject(candidate);
    if (!project || ids.has(project.id) || paths.has(project.path)) continue;
    ids.add(project.id);
    paths.add(project.path);
    projects.push(project);
  }
  return projects;
}

function normalizeProject(value: unknown): ProjectConfig | undefined {
  if (!isRecord(value)) return undefined;
  const id = normalizeNonEmptyString(value.id);
  const name = normalizeNonEmptyString(value.name);
  const projectPath = normalizeAbsolutePath(value.path);
  if (!id || !name || !projectPath) return undefined;
  const setupScript = normalizeNonEmptyString(value.setupScript);
  return { id, name, path: projectPath, ...(setupScript ? { setupScript } : {}) };
}

function normalizeRecentRepositories(value: unknown, now: number): RecentRepository[] {
  if (!Array.isArray(value)) return [];
  const repositories = value
    .map((candidate, index) => normalizeRecentRepository(candidate, now, index))
    .filter((candidate): candidate is RecentRepository & { inputIndex: number } =>
      Boolean(candidate),
    )
    .sort(
      (left, right) =>
        Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt) ||
        left.inputIndex - right.inputIndex,
    )
    .map((candidate): RecentRepository => ({
      repositoryId: candidate.repositoryId,
      name: candidate.name,
      ...(candidate.commonDirectoryPath
        ? { commonDirectoryPath: candidate.commonDirectoryPath }
        : {}),
      mainWorktreePath: candidate.mainWorktreePath,
      lastOpenedPath: candidate.lastOpenedPath,
      lastOpenedAt: candidate.lastOpenedAt,
    }));
  return deduplicateAndSortRecents(repositories);
}

function normalizeRecentRepository(
  value: unknown,
  now: number,
  inputIndex: number,
): (RecentRepository & { inputIndex: number }) | undefined {
  if (!isRecord(value)) return undefined;
  const repositoryId = normalizeNonEmptyString(value.repositoryId);
  const name = normalizeNonEmptyString(value.name);
  const commonDirectoryPath = normalizeAbsolutePath(value.commonDirectoryPath);
  const mainWorktreePath = normalizeAbsolutePath(value.mainWorktreePath);
  const lastOpenedPath = normalizeAbsolutePath(value.lastOpenedPath);
  if (!repositoryId || !name || !mainWorktreePath || !lastOpenedPath) return undefined;
  return {
    repositoryId,
    name,
    ...(commonDirectoryPath ? { commonDirectoryPath } : {}),
    mainWorktreePath,
    lastOpenedPath,
    lastOpenedAt: normalizeDate(value.lastOpenedAt, now),
    inputIndex,
  };
}

function reconcileProjectRecents(
  projects: readonly ProjectConfig[],
  recents: readonly RecentRepository[],
  now: number,
): RecentRepository[] {
  const reconciled = [...recents];
  for (const project of projects) {
    const matchingIndex = reconciled.findIndex(
      (recent) =>
        recent.repositoryId === project.id || recent.mainWorktreePath === project.path,
    );
    if (matchingIndex === -1) {
      reconciled.push(recentFromProject(project, project.path, now));
      continue;
    }
    const matching = reconciled[matchingIndex];
    if (!matching) continue;
    reconciled[matchingIndex] = {
      ...matching,
      repositoryId: project.id,
      name: project.name,
      mainWorktreePath: project.path,
    };
  }
  return deduplicateAndSortRecents(reconciled);
}

function normalizeRepositoryPreferences(
  value: unknown,
): Record<string, RepositoryPreferences> {
  if (!isRecord(value)) return {};
  const result: Record<string, RepositoryPreferences> = {};
  for (const [rawRepositoryId, candidate] of Object.entries(value)) {
    const repositoryId = normalizeNonEmptyString(rawRepositoryId);
    if (!repositoryId || !isRecord(candidate)) continue;
    const setupScript = normalizeNonEmptyString(candidate.setupScript);
    result[repositoryId] = {
      ...(setupScript ? { setupScript } : {}),
      comparisonBaseOverrides: normalizeComparisonBaseOverrides(
        candidate.comparisonBaseOverrides,
      ),
    };
  }
  return result;
}

function normalizeComparisonBaseOverrides(
  value: unknown,
): Record<string, ComparisonBaseOverride> {
  if (!isRecord(value)) return {};
  const result: Record<string, ComparisonBaseOverride> = {};
  for (const [rawWorktreeId, candidate] of Object.entries(value)) {
    const worktreeId = normalizeNonEmptyString(rawWorktreeId);
    if (!worktreeId || !isRecord(candidate)) continue;
    const sourceBranch = normalizeNonEmptyString(candidate.sourceBranch);
    const targetBranch = normalizeNonEmptyString(candidate.targetBranch);
    if (sourceBranch && targetBranch) {
      result[worktreeId] = { sourceBranch, targetBranch };
    }
  }
  return result;
}

function migrateLegacyPreferences(
  projects: readonly ProjectConfig[],
  legacyOverrides: Readonly<Record<string, ComparisonBaseOverride>>,
  preferencesByRepository: Record<string, RepositoryPreferences>,
): void {
  const projectIdsLongestFirst = projects
    .map((project) => project.id)
    .sort((left, right) => right.length - left.length);
  for (const project of projects) {
    const preferences = (preferencesByRepository[project.id] ??= {
      comparisonBaseOverrides: {},
    });
    if (!preferences.setupScript && project.setupScript) {
      preferences.setupScript = project.setupScript;
    }
  }

  for (const [worktreeId, override] of Object.entries(legacyOverrides)) {
    const repositoryId = projectIdsLongestFirst.find((id) =>
      worktreeId.startsWith(`${id}:`),
    );
    if (!repositoryId) continue;
    const preferences = preferencesByRepository[repositoryId];
    if (!preferences) continue;
    preferences.comparisonBaseOverrides[worktreeId] ??= override;
  }
}

function upsertRecentRepository(
  state: PersistedState,
  repository: ProjectConfig,
  lastOpenedPath: string,
  now: number,
  commonDirectoryPath?: string,
): void {
  const normalizedLastOpenedPath =
    normalizeAbsolutePath(lastOpenedPath) ?? repository.path;
  const normalizedCommonDirectoryPath = normalizeAbsolutePath(commonDirectoryPath);
  const existingIndex = state.recentRepositories.findIndex(
    (candidate) =>
      candidate.repositoryId === repository.id ||
      candidate.mainWorktreePath === repository.path ||
      (normalizedCommonDirectoryPath !== undefined &&
        candidate.commonDirectoryPath === normalizedCommonDirectoryPath),
  );
  const existing = state.recentRepositories[existingIndex];
  const recent: RecentRepository = {
    ...(existing ?? recentFromProject(repository, normalizedLastOpenedPath, now)),
    repositoryId: repository.id,
    name: repository.name,
    ...(normalizedCommonDirectoryPath
      ? { commonDirectoryPath: normalizedCommonDirectoryPath }
      : {}),
    mainWorktreePath: repository.path,
    lastOpenedPath: normalizedLastOpenedPath,
    lastOpenedAt: dateFromTimestamp(now),
  };
  if (existingIndex >= 0) state.recentRepositories.splice(existingIndex, 1);
  state.recentRepositories.unshift(recent);
  ensureRepositoryPreferences(state, repository.id);
}

function recentFromProject(
  project: ProjectConfig,
  lastOpenedPath: string,
  now: number,
): RecentRepository {
  return {
    repositoryId: project.id,
    name: project.name,
    mainWorktreePath: project.path,
    lastOpenedPath,
    lastOpenedAt: dateFromTimestamp(now),
  };
}

function deduplicateAndSortRecents(
  repositories: readonly RecentRepository[],
): RecentRepository[] {
  const sorted = repositories
    .map((repository, inputIndex) => ({ repository, inputIndex }))
    .sort(
      (left, right) =>
        Date.parse(right.repository.lastOpenedAt) -
          Date.parse(left.repository.lastOpenedAt) || left.inputIndex - right.inputIndex,
    );
  const ids = new Set<string>();
  const paths = new Set<string>();
  const commonDirectoryPaths = new Set<string>();
  return sorted.flatMap(({ repository }) => {
    if (
      ids.has(repository.repositoryId) ||
      paths.has(repository.mainWorktreePath) ||
      (repository.commonDirectoryPath !== undefined &&
        commonDirectoryPaths.has(repository.commonDirectoryPath))
    ) {
      return [];
    }
    ids.add(repository.repositoryId);
    paths.add(repository.mainWorktreePath);
    if (repository.commonDirectoryPath) {
      commonDirectoryPaths.add(repository.commonDirectoryPath);
    }
    return [repository];
  });
}

function assertKnownRepository(state: PersistedState, repositoryId: string): void {
  if (
    !state.recentRepositories.some(
      (repository) => repository.repositoryId === repositoryId,
    )
  ) {
    throw new Error('Repository not found.');
  }
}

function ensureRepositoryPreferences(
  state: PersistedState,
  repositoryId: string,
): RepositoryPreferences {
  return (state.repositoryPreferences[repositoryId] ??= {
    comparisonBaseOverrides: {},
  });
}

function normalizeAbsolutePath(value: unknown): string | undefined {
  const candidate = normalizeNonEmptyString(value);
  if (!candidate || !path.isAbsolute(candidate)) return undefined;
  const normalized = path.normalize(candidate);
  const root = path.parse(normalized).root;
  return normalized.length > root.length && normalized.endsWith(path.sep)
    ? normalized.slice(0, -1)
    : normalized;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeDate(value: unknown, now: number): string {
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return dateFromTimestamp(now);
}

function dateFromTimestamp(timestamp: number): string {
  return new Date(Number.isFinite(timestamp) ? timestamp : 0).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFileNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

async function persistState(file: string, state: PersistedState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}
