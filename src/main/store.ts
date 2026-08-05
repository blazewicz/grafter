import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import type { ProjectConfig, RecentRepository, Settings } from '../shared/contracts';
import { defaultSettings, normalizeSettings } from '../shared/settings';

export const currentStateSchemaVersion = 1;

export interface ComparisonBaseOverride {
  sourceBranch: string;
  targetBranch: string;
}

export interface RepositoryPreferences {
  setupScript?: string;
  comparisonBaseOverrides: Record<string, ComparisonBaseOverride>;
}

export interface PersistedState {
  schemaVersion: typeof currentStateSchemaVersion;
  /** Compatibility data used by the current multi-project renderer. */
  projects: ProjectConfig[];
  settings: Settings;
  /** Compatibility copy; repositoryPreferences is the scoped source of truth. */
  comparisonBaseOverrides: Record<string, ComparisonBaseOverride>;
  recentRepositories: RecentRepository[];
  repositoryPreferences: Record<string, RepositoryPreferences>;
}

const initialState: PersistedState = {
  schemaVersion: currentStateSchemaVersion,
  projects: [],
  settings: defaultSettings,
  comparisonBaseOverrides: {},
  recentRepositories: [],
  repositoryPreferences: {},
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
      const previous = this.#state;
      const draft = structuredClone(previous);
      mutator(draft);
      synchronizeCompatibilityChanges(previous, draft, this.#now());
      await this.#persist(this.#file, draft);
      this.#state = draft;
    });
  }

  async addRepository(
    project: ProjectConfig,
    lastOpenedPath = project.path,
    commonDirectoryPath?: string,
  ): Promise<void> {
    await this.update((state) => {
      if (state.projects.some((candidate) => candidate.id === project.id)) return;
      state.projects.push(project);
      upsertRecentRepository(
        state,
        project,
        lastOpenedPath,
        this.#now(),
        commonDirectoryPath,
      );
    });
  }

  async openRepository(
    repositoryId: string,
    lastOpenedPath: string,
    commonDirectoryPath?: string,
  ): Promise<void> {
    await this.update((state) => {
      const project = state.projects.find((candidate) => candidate.id === repositoryId);
      if (!project) throw new Error('Project not found.');
      upsertRecentRepository(
        state,
        project,
        lastOpenedPath,
        this.#now(),
        commonDirectoryPath,
      );
    });
  }

  async removeRepository(repositoryId: string): Promise<void> {
    await this.update((state) => {
      state.projects = state.projects.filter((project) => project.id !== repositoryId);
      state.recentRepositories = state.recentRepositories.filter(
        (repository) => repository.repositoryId !== repositoryId,
      );
      delete state.repositoryPreferences[repositoryId];
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
      const project = state.projects.find((candidate) => candidate.id === repositoryId);
      if (!project) throw new Error('Project not found.');
      const preferences = ensureRepositoryPreferences(state, repositoryId);
      const normalizedScript = normalizeNonEmptyString(setupScript);
      if (normalizedScript) {
        preferences.setupScript = normalizedScript;
        project.setupScript = normalizedScript;
      } else {
        delete preferences.setupScript;
        delete project.setupScript;
      }
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
      if (!state.projects.some((project) => project.id === repositoryId)) {
        throw new Error('Project not found.');
      }
      const preferences = ensureRepositoryPreferences(state, repositoryId);
      if (override) {
        preferences.comparisonBaseOverrides[worktreeId] = override;
        state.comparisonBaseOverrides[worktreeId] = override;
      } else {
        delete preferences.comparisonBaseOverrides[worktreeId];
        delete state.comparisonBaseOverrides[worktreeId];
      }
    });
  }
}

export function normalizePersistedState(value: unknown, now: number): PersistedState {
  if (!isRecord(value)) return structuredClone(initialState);
  const schemaVersion = normalizeSchemaVersion(value.schemaVersion);
  if (schemaVersion > currentStateSchemaVersion) {
    throw new Error(
      `State schema version ${schemaVersion} is newer than this version of Grafter supports.`,
    );
  }

  const projects = normalizeProjects(value.projects);
  const normalizedRecents = normalizeRecentRepositories(value.recentRepositories, now);
  const recentRepositories = reconcileProjectRecents(projects, normalizedRecents, now);
  const comparisonBaseOverrides = normalizeComparisonBaseOverrides(
    value.comparisonBaseOverrides,
  );
  const repositoryPreferences = normalizeRepositoryPreferences(
    value.repositoryPreferences,
  );
  migrateLegacyPreferences(projects, comparisonBaseOverrides, repositoryPreferences);

  return {
    schemaVersion: currentStateSchemaVersion,
    projects,
    settings: normalizeSettings(value.settings),
    comparisonBaseOverrides,
    recentRepositories,
    repositoryPreferences,
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
    );
  const ids = new Set<string>();
  const paths = new Set<string>();
  const commonDirectoryPaths = new Set<string>();
  return repositories.flatMap((candidate) => {
    const repository: RecentRepository = {
      repositoryId: candidate.repositoryId,
      name: candidate.name,
      ...(candidate.commonDirectoryPath
        ? { commonDirectoryPath: candidate.commonDirectoryPath }
        : {}),
      mainWorktreePath: candidate.mainWorktreePath,
      lastOpenedPath: candidate.lastOpenedPath,
      lastOpenedAt: candidate.lastOpenedAt,
    };
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
  const remaining = [...recents];
  for (const project of projects) {
    const matchingIndex = remaining.findIndex(
      (recent) =>
        recent.repositoryId === project.id || recent.mainWorktreePath === project.path,
    );
    if (matchingIndex === -1) {
      remaining.push(recentFromProject(project, project.path, now));
      continue;
    }
    const matching = remaining[matchingIndex];
    if (!matching) continue;
    remaining[matchingIndex] = {
      ...matching,
      repositoryId: project.id,
      name: project.name,
      mainWorktreePath: project.path,
    };
  }
  return deduplicateAndSortRecents(remaining);
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
  projects: ProjectConfig[],
  legacyOverrides: Record<string, ComparisonBaseOverride>,
  preferencesByRepository: Record<string, RepositoryPreferences>,
): void {
  const projectIdsLongestFirst = projects
    .map((project) => project.id)
    .sort((left, right) => right.length - left.length);
  for (const project of projects) {
    const existing = preferencesByRepository[project.id];
    const preferences = existing ?? { comparisonBaseOverrides: {} };
    if (existing?.setupScript) {
      project.setupScript = existing.setupScript;
    } else if (project.setupScript) {
      preferences.setupScript = project.setupScript;
    }
    preferencesByRepository[project.id] = preferences;
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

  for (const preferences of Object.values(preferencesByRepository)) {
    Object.assign(legacyOverrides, preferences.comparisonBaseOverrides);
  }
}

function synchronizeCompatibilityChanges(
  previous: PersistedState,
  draft: PersistedState,
  now: number,
): void {
  draft.schemaVersion = currentStateSchemaVersion;
  const previousProjects = new Map(
    previous.projects.map((project) => [project.id, project]),
  );
  const draftIds = new Set(draft.projects.map((project) => project.id));

  for (const repositoryId of previousProjects.keys()) {
    if (draftIds.has(repositoryId)) continue;
    draft.recentRepositories = draft.recentRepositories.filter(
      (repository) => repository.repositoryId !== repositoryId,
    );
    delete draft.repositoryPreferences[repositoryId];
  }

  for (const project of draft.projects) {
    const previousProject = previousProjects.get(project.id);
    if (!previousProject) {
      const recent = draft.recentRepositories.find(
        (repository) =>
          repository.repositoryId === project.id ||
          repository.mainWorktreePath === project.path,
      );
      if (!recent) {
        upsertRecentRepository(draft, project, project.path, now, undefined, false);
      }
    } else {
      const recent = draft.recentRepositories.find(
        (repository) => repository.repositoryId === project.id,
      );
      if (recent) {
        recent.name = project.name;
        recent.mainWorktreePath = project.path;
      }
    }
    const preferences = ensureRepositoryPreferences(draft, project.id);
    if (project.setupScript) preferences.setupScript = project.setupScript;
    else delete preferences.setupScript;
  }

  synchronizeLegacyComparisonChanges(previous, draft);
  draft.recentRepositories = deduplicateAndSortRecents(draft.recentRepositories);
}

function synchronizeLegacyComparisonChanges(
  previous: PersistedState,
  draft: PersistedState,
): void {
  const repositoryIds = draft.projects
    .map((project) => project.id)
    .sort((left, right) => right.length - left.length);
  const changedWorktreeIds = new Set([
    ...Object.keys(previous.comparisonBaseOverrides),
    ...Object.keys(draft.comparisonBaseOverrides),
  ]);
  for (const worktreeId of changedWorktreeIds) {
    const before = previous.comparisonBaseOverrides[worktreeId];
    const after = draft.comparisonBaseOverrides[worktreeId];
    if (comparisonOverridesEqual(before, after)) continue;
    const repositoryId = repositoryIds.find((id) => worktreeId.startsWith(`${id}:`));
    if (!repositoryId) continue;
    const preferences = ensureRepositoryPreferences(draft, repositoryId);
    if (after) preferences.comparisonBaseOverrides[worktreeId] = after;
    else delete preferences.comparisonBaseOverrides[worktreeId];
  }
}

function upsertRecentRepository(
  state: PersistedState,
  project: ProjectConfig,
  lastOpenedPath: string,
  now: number,
  commonDirectoryPath?: string,
  touch = true,
): void {
  const normalizedLastOpenedPath = normalizeAbsolutePath(lastOpenedPath) ?? project.path;
  const normalizedCommonDirectoryPath = normalizeAbsolutePath(commonDirectoryPath);
  const existingIndex = state.recentRepositories.findIndex(
    (repository) =>
      repository.repositoryId === project.id ||
      repository.mainWorktreePath === project.path ||
      (normalizedCommonDirectoryPath !== undefined &&
        repository.commonDirectoryPath === normalizedCommonDirectoryPath),
  );
  const existing = state.recentRepositories[existingIndex];
  const recent = {
    ...(existing ?? recentFromProject(project, normalizedLastOpenedPath, now)),
    repositoryId: project.id,
    name: project.name,
    ...(normalizedCommonDirectoryPath
      ? { commonDirectoryPath: normalizedCommonDirectoryPath }
      : {}),
    mainWorktreePath: project.path,
    lastOpenedPath: normalizedLastOpenedPath,
    ...(touch ? { lastOpenedAt: dateFromTimestamp(now) } : {}),
  };
  if (existingIndex >= 0) state.recentRepositories.splice(existingIndex, 1);
  state.recentRepositories.unshift(recent);
  state.recentRepositories = deduplicateAndSortRecents(state.recentRepositories);
  ensureRepositoryPreferences(state, project.id);
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

function ensureRepositoryPreferences(
  state: PersistedState,
  repositoryId: string,
): RepositoryPreferences {
  return (state.repositoryPreferences[repositoryId] ??= {
    comparisonBaseOverrides: {},
  });
}

function comparisonOverridesEqual(
  left: ComparisonBaseOverride | undefined,
  right: ComparisonBaseOverride | undefined,
): boolean {
  return (
    left?.sourceBranch === right?.sourceBranch &&
    left?.targetBranch === right?.targetBranch
  );
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
