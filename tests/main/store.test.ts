import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  currentStateSchemaVersion,
  normalizePersistedState,
  StateStore,
} from '../../src/main/store';
import type { PersistedState } from '../../src/main/store';
import type { ProjectConfig } from '../../src/shared/contracts';

describe('StateStore', () => {
  it('starts with pristine schema-v2 state and writes only normalized fields', async () => {
    const directory = await temporaryStoreDirectory();
    const store = new StateStore(directory);

    await store.load();

    expect(store.state).toEqual({
      schemaVersion: currentStateSchemaVersion,
      settings: {
        defaultWorktreePath: '../<repo_name>.worktrees',
        dateFormat: 'system',
        timeFormat: 'system',
      },
      recentRepositories: [],
      repositoryPreferences: {},
      toolPreferences: { editor: 'vscode', terminal: 'terminal' },
    });

    await store.update((state) => {
      state.settings.defaultWorktreePath = '/worktrees/<repo_name>';
    });
    const saved: unknown = JSON.parse(
      await readFile(path.join(directory, 'grafter-state.json'), 'utf8'),
    );

    expect(saved).toMatchObject({
      schemaVersion: currentStateSchemaVersion,
      settings: { defaultWorktreePath: '/worktrees/<repo_name>' },
      recentRepositories: [],
      repositoryPreferences: {},
      toolPreferences: { editor: 'vscode', terminal: 'terminal' },
    });
    expect(saved).not.toHaveProperty('projects');
    expect(saved).not.toHaveProperty('comparisonBaseOverrides');
  });

  it('loads the oldest supported settings-only shape', async () => {
    const store = await loadState({
      projects: [],
      settings: { defaultWorktreePath: '/legacy/<repo_name>' },
    });

    expect(store.state.settings).toEqual({
      defaultWorktreePath: '/legacy/<repo_name>',
      dateFormat: 'system',
      timeFormat: 'system',
    });
    expect(store.state.recentRepositories).toEqual([]);
    expect(store.state.repositoryPreferences).toEqual({});
  });

  it('normalizes legacy projects, setup overrides, and comparison overrides', async () => {
    const now = Date.parse('2026-08-04T12:00:00.000Z');
    const store = await loadState(
      {
        projects: [
          {
            id: 'repo-one',
            name: 'Repository one',
            path: '/code/repo-one',
            setupScript: 'npm ci',
          },
          { id: 'repo-two', name: 'Repository two', path: '/code/repo-two' },
        ],
        settings: { defaultWorktreePath: '/worktrees/<repo_name>' },
        comparisonBaseOverrides: {
          'repo-one:/code/repo-one.worktrees/feature': {
            sourceBranch: 'feature',
            targetBranch: 'main',
          },
          unrelated: { sourceBranch: 'topic', targetBranch: 'release' },
        },
      },
      now,
    );

    expect(store.state.recentRepositories).toEqual([
      {
        repositoryId: 'repo-one',
        name: 'Repository one',
        mainWorktreePath: '/code/repo-one',
        lastOpenedPath: '/code/repo-one',
        lastOpenedAt: '2026-08-04T12:00:00.000Z',
      },
      {
        repositoryId: 'repo-two',
        name: 'Repository two',
        mainWorktreePath: '/code/repo-two',
        lastOpenedPath: '/code/repo-two',
        lastOpenedAt: '2026-08-04T12:00:00.000Z',
      },
    ]);
    expect(store.state.repositoryPreferences).toEqual({
      'repo-one': {
        setupScript: 'npm ci',
        comparisonBaseOverrides: {
          'repo-one:/code/repo-one.worktrees/feature': {
            sourceBranch: 'feature',
            targetBranch: 'main',
          },
        },
      },
      'repo-two': { comparisonBaseOverrides: {} },
    });
    expect(store.state).not.toHaveProperty('projects');
    expect(store.state).not.toHaveProperty('comparisonBaseOverrides');
  });

  it('preserves new-format data in partially migrated input and is idempotent', () => {
    const input = {
      schemaVersion: 1,
      projects: [
        {
          id: 'stable-id',
          name: 'Repository',
          path: '/current/main',
          setupScript: 'old setup',
        },
      ],
      settings: {},
      comparisonBaseOverrides: {
        'stable-id:/linked': { sourceBranch: 'feature', targetBranch: 'old-base' },
      },
      recentRepositories: [
        {
          repositoryId: 'stable-id',
          name: 'Old name',
          mainWorktreePath: '/old/main',
          lastOpenedPath: '/last/opened/linked',
          lastOpenedAt: '2025-06-07T08:09:10.000Z',
        },
      ],
      repositoryPreferences: {
        'stable-id': {
          setupScript: 'scoped setup',
          comparisonBaseOverrides: {
            'stable-id:/linked': {
              sourceBranch: 'feature',
              targetBranch: 'release',
            },
          },
        },
      },
    };

    const first = normalizePersistedState(input, Date.parse('2026-01-01T00:00:00.000Z'));
    const second = normalizePersistedState(first, Date.parse('2027-01-01T00:00:00.000Z'));

    expect(second).toEqual(first);
    expect(second.recentRepositories).toEqual([
      {
        repositoryId: 'stable-id',
        name: 'Repository',
        mainWorktreePath: '/current/main',
        lastOpenedPath: '/last/opened/linked',
        lastOpenedAt: '2025-06-07T08:09:10.000Z',
      },
    ]);
    expect(second.repositoryPreferences['stable-id']).toEqual({
      setupScript: 'scoped setup',
      comparisonBaseOverrides: {
        'stable-id:/linked': {
          sourceBranch: 'feature',
          targetBranch: 'release',
        },
      },
    });
  });

  it('degrades malformed and duplicate legacy/new records safely', () => {
    const normalized = normalizePersistedState(
      {
        schemaVersion: 'latest',
        projects: [
          { id: ' repo ', name: ' Repository ', path: '/code/repo/' },
          { id: 'repo', name: 'Duplicate ID', path: '/code/other' },
          { id: 'other', name: 'Duplicate path', path: '/code/repo' },
          { id: '', name: 'Missing ID', path: '/missing-id' },
          { id: 'relative', name: 'Relative', path: 'relative/path' },
          null,
        ],
        settings: null,
        comparisonBaseOverrides: [],
        recentRepositories: [
          {
            repositoryId: 'recent-newer',
            name: 'Newer',
            mainWorktreePath: '/recent/shared',
            lastOpenedPath: '/recent/shared/linked',
            lastOpenedAt: '2026-02-01T00:00:00Z',
          },
          {
            repositoryId: 'recent-older',
            name: 'Duplicate path',
            mainWorktreePath: '/recent/shared/',
            lastOpenedPath: '/recent/shared',
            lastOpenedAt: '2025-01-01T00:00:00Z',
          },
          {
            repositoryId: 'bad-path',
            name: 'Bad path',
            mainWorktreePath: 'relative',
            lastOpenedPath: '/valid',
          },
        ],
        repositoryPreferences: {
          repo: {
            setupScript: 12,
            comparisonBaseOverrides: {
              valid: { sourceBranch: ' feature ', targetBranch: ' main ' },
              empty: { sourceBranch: '', targetBranch: 'main' },
              malformed: 'main',
            },
          },
          invalid: null,
        },
      },
      Date.parse('2026-08-04T00:00:00.000Z'),
    );

    expect(normalized.recentRepositories).toEqual([
      {
        repositoryId: 'repo',
        name: 'Repository',
        mainWorktreePath: '/code/repo',
        lastOpenedPath: '/code/repo',
        lastOpenedAt: '2026-08-04T00:00:00.000Z',
      },
      {
        repositoryId: 'recent-newer',
        name: 'Newer',
        mainWorktreePath: '/recent/shared',
        lastOpenedPath: '/recent/shared/linked',
        lastOpenedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    expect(normalized.repositoryPreferences).toEqual({
      repo: {
        comparisonBaseOverrides: {
          valid: { sourceBranch: 'feature', targetBranch: 'main' },
        },
      },
    });
  });

  it('loads missing recent paths without repository inspection', async () => {
    const store = await loadState(
      {
        recentRepositories: [
          {
            repositoryId: 'missing',
            name: 'Missing repository',
            mainWorktreePath: '/definitely/not/a/repository',
            lastOpenedPath: '/also/missing',
            lastOpenedAt: 'not-a-date',
          },
        ],
      },
      Date.parse('2026-08-04T10:30:00.000Z'),
    );

    expect(store.state.recentRepositories[0]?.lastOpenedAt).toBe(
      '2026-08-04T10:30:00.000Z',
    );
  });

  it('writes a complete normalized transaction immediately after legacy migration', async () => {
    const directory = await temporaryStoreDirectory();
    await writeState(directory, {
      projects: [
        {
          id: 'repository',
          name: 'Repository',
          path: '/repository',
          setupScript: 'npm ci',
        },
      ],
      comparisonBaseOverrides: {
        'repository:/feature': { sourceBranch: 'feature', targetBranch: 'main' },
      },
    });
    const store = new StateStore(directory);
    await store.load();

    await store.update((state) => {
      state.settings.timeFormat = '24-hour';
    });
    const saved: unknown = JSON.parse(
      await readFile(path.join(directory, 'grafter-state.json'), 'utf8'),
    );

    expect(saved).toMatchObject({
      schemaVersion: currentStateSchemaVersion,
      settings: { timeFormat: '24-hour' },
      recentRepositories: [{ repositoryId: 'repository' }],
      repositoryPreferences: {
        repository: {
          setupScript: 'npm ci',
          comparisonBaseOverrides: {
            'repository:/feature': {
              sourceBranch: 'feature',
              targetBranch: 'main',
            },
          },
        },
      },
    });
    expect(saved).not.toHaveProperty('projects');
    expect(saved).not.toHaveProperty('comparisonBaseOverrides');
  });

  it('updates recents and repository preferences without legacy mirrors', async () => {
    let now = Date.parse('2026-08-04T12:00:00.000Z');
    const persisted: PersistedState[] = [];
    const store = new StateStore('/state', {
      now: () => now,
      persist: (_file, state) => {
        persisted.push(structuredClone(state));
        return Promise.resolve();
      },
    });
    const repository = project('repository');

    await store.addRepository(
      { ...repository, setupScript: 'pnpm install' },
      '/repository.worktrees/feature',
      '/repository/.git',
    );
    now += 60_000;
    await store.openRepository('repository', '/repository.worktrees/other');
    await store.setRepositorySetupScript('repository', '  npm ci  ');
    const worktreeId = 'repository:/repository.worktrees/feature';
    await store.setComparisonBaseOverride('repository', worktreeId, {
      sourceBranch: 'feature',
      targetBranch: 'main',
    });

    expect(store.state.recentRepositories[0]).toMatchObject({
      repositoryId: 'repository',
      commonDirectoryPath: '/repository/.git',
      lastOpenedPath: '/repository.worktrees/other',
      lastOpenedAt: '2026-08-04T12:01:00.000Z',
    });
    expect(store.repositorySetupScript('repository')).toBe('npm ci');
    expect(store.comparisonBaseOverride('repository', worktreeId)).toEqual({
      sourceBranch: 'feature',
      targetBranch: 'main',
    });
    expect(persisted).toHaveLength(4);
    for (const state of persisted) {
      expect(state).not.toHaveProperty('projects');
      expect(state).not.toHaveProperty('comparisonBaseOverrides');
    }
  });

  it('persists validated tool preferences and falls back to defaults', async () => {
    const persisted: PersistedState[] = [];
    const store = new StateStore('/state', {
      persist: (_file, state) => {
        persisted.push(structuredClone(state));
        return Promise.resolve();
      },
    });

    expect(store.toolPreference('editor')).toBe('vscode');
    expect(store.toolPreference('terminal')).toBe('terminal');

    await store.setToolPreference('terminal', 'iterm2');
    await store.setToolPreference('editor', 'vscode');

    expect(store.toolPreference('terminal')).toBe('iterm2');
    expect(store.toolPreference('editor')).toBe('vscode');
    expect(persisted.at(-1)?.toolPreferences).toEqual({
      editor: 'vscode',
      terminal: 'iterm2',
    });
  });

  it('rejects invalid tool preferences without persisting', async () => {
    const persisted: PersistedState[] = [];
    const store = new StateStore('/state', {
      persist: (_file, state) => {
        persisted.push(structuredClone(state));
        return Promise.resolve();
      },
    });

    await expect(store.setToolPreference('editor', 'iterm2')).rejects.toThrow(
      'Invalid tool preference.',
    );
    await expect(
      store.setToolPreference('unknown' as 'editor', 'vscode'),
    ).rejects.toThrow('Invalid tool picker group.');
    expect(store.toolPreference('editor')).toBe('vscode');
    expect(persisted).toHaveLength(0);
  });

  it('serializes simultaneous repository writes in invocation order', async () => {
    const firstWriteStarted = deferred<void>();
    const releaseFirstWrite = deferred<void>();
    const persisted: PersistedState[] = [];
    const store = new StateStore('/state', {
      persist: async (_file, state) => {
        persisted.push(structuredClone(state));
        if (persisted.length === 1) {
          firstWriteStarted.resolve();
          await releaseFirstWrite.promise;
        }
      },
    });

    const first = store.addRepository(project('first'));
    const second = store.addRepository(project('second'));
    const third = store.addRepository(project('third'));

    await firstWriteStarted.promise;
    expect(store.state.recentRepositories).toEqual([]);
    releaseFirstWrite.resolve();
    await Promise.all([first, second, third]);

    expect(
      persisted.map((state) =>
        state.recentRepositories.map((repository) => repository.repositoryId),
      ),
    ).toEqual([['first'], ['second', 'first'], ['third', 'second', 'first']]);
  });

  it('does not publish a failed write and continues with queued work', async () => {
    let persistenceAttempt = 0;
    const persisted: PersistedState[] = [];
    const store = new StateStore('/state', {
      persist: (_file, state) => {
        persistenceAttempt += 1;
        if (persistenceAttempt === 1) return Promise.reject(new Error('Disk full.'));
        persisted.push(structuredClone(state));
        return Promise.resolve();
      },
    });

    const failed = store.addRepository(project('failed'));
    const succeeded = store.addRepository(project('saved'));

    await expect(failed).rejects.toThrow('Disk full.');
    await expect(succeeded).resolves.toBeUndefined();
    expect(store.state.recentRepositories.map((item) => item.repositoryId)).toEqual([
      'saved',
    ]);
    expect(persisted).toHaveLength(1);
  });

  it('refuses a future schema instead of destructively downgrading it', async () => {
    const directory = await temporaryStoreDirectory();
    await writeState(directory, { schemaVersion: currentStateSchemaVersion + 1 });
    const store = new StateStore(directory);

    await expect(store.load()).rejects.toThrow('newer than this version');
  });
});

async function temporaryStoreDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'grafter-store-'));
}

async function writeState(directory: string, state: unknown): Promise<void> {
  await writeFile(
    path.join(directory, 'grafter-state.json'),
    JSON.stringify(state),
    'utf8',
  );
}

async function loadState(state: unknown, now = Date.now()): Promise<StateStore> {
  const directory = await temporaryStoreDirectory();
  await writeState(directory, state);
  const store = new StateStore(directory, { now: () => now });
  await store.load();
  return store;
}

function project(id: string): ProjectConfig {
  return { id, name: id, path: `/${id}` };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolve) throw new Error('Deferred promise was not initialized.');
      resolve(value);
    },
  };
}
