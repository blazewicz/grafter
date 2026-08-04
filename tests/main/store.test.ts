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

describe('StateStore', () => {
  it('uses the default worktree template and persists updates atomically', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-store-'));
    const store = new StateStore(directory);
    await store.load();
    expect(store.state.settings.defaultWorktreePath).toBe('../<repo_name>.worktrees');
    expect(store.state.settings.dateFormat).toBe('system');
    expect(store.state.settings.timeFormat).toBe('system');
    expect(store.state.schemaVersion).toBe(currentStateSchemaVersion);
    expect(store.state.comparisonBaseOverrides).toEqual({});
    expect(store.state.recentRepositories).toEqual([]);
    expect(store.state.repositoryPreferences).toEqual({});

    await store.update((state) => {
      state.settings.defaultWorktreePath = '/worktrees/<repo_name>';
      state.settings.dateFormat = 'day-month-year';
      state.settings.timeFormat = '24-hour';
    });

    const saved = JSON.parse(
      await readFile(path.join(directory, 'grafter-state.json'), 'utf8'),
    ) as {
      settings: {
        defaultWorktreePath: string;
        dateFormat: string;
        timeFormat: string;
      };
    };
    expect(saved.settings).toEqual({
      defaultWorktreePath: '/worktrees/<repo_name>',
      dateFormat: 'day-month-year',
      timeFormat: '24-hour',
    });
    expect(saved).toMatchObject({
      schemaVersion: currentStateSchemaVersion,
      recentRepositories: [],
      repositoryPreferences: {},
    });
  });

  it('adds system date and time preferences to legacy saved state', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-store-'));
    await writeFile(
      path.join(directory, 'grafter-state.json'),
      JSON.stringify({
        projects: [],
        settings: { defaultWorktreePath: '/legacy/<repo_name>' },
      }),
      'utf8',
    );

    const store = new StateStore(directory);
    await store.load();

    expect(store.state.settings).toEqual({
      defaultWorktreePath: '/legacy/<repo_name>',
      dateFormat: 'system',
      timeFormat: 'system',
    });
    expect(store.state.comparisonBaseOverrides).toEqual({});
  });

  it('loads only valid persisted comparison base overrides', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-store-'));
    await writeFile(
      path.join(directory, 'grafter-state.json'),
      JSON.stringify({
        projects: [],
        settings: {},
        comparisonBaseOverrides: {
          valid: { sourceBranch: 'feature', targetBranch: 'release' },
          empty: { sourceBranch: '', targetBranch: 'main' },
          malformed: 'main',
        },
      }),
      'utf8',
    );

    const store = new StateStore(directory);
    await store.load();

    expect(store.state.comparisonBaseOverrides).toEqual({
      valid: { sourceBranch: 'feature', targetBranch: 'release' },
    });
  });

  it('migrates legacy projects into ordered recents and scoped preferences', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-store-'));
    await writeFile(
      path.join(directory, 'grafter-state.json'),
      JSON.stringify({
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
      }),
      'utf8',
    );
    const now = Date.parse('2026-08-04T12:00:00.000Z');
    const store = new StateStore(directory, { now: () => now });

    await store.load();

    expect(store.state.projects).toEqual([
      {
        id: 'repo-one',
        name: 'Repository one',
        path: '/code/repo-one',
        setupScript: 'npm ci',
      },
      { id: 'repo-two', name: 'Repository two', path: '/code/repo-two' },
    ]);
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
  });

  it('keeps migrated timestamps, paths, IDs, and scoped preferences idempotent', () => {
    const migrated = {
      schemaVersion: currentStateSchemaVersion,
      projects: [
        {
          id: 'stable-id',
          name: 'Repository',
          path: '/current/main',
          setupScript: 'legacy script',
        },
      ],
      settings: {},
      comparisonBaseOverrides: {
        'stable-id:/linked': { sourceBranch: 'feature', targetBranch: 'legacy' },
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
          setupScript: 'scoped script',
          comparisonBaseOverrides: {
            'stable-id:/linked': { sourceBranch: 'feature', targetBranch: 'release' },
          },
        },
      },
    };

    const first = normalizePersistedState(
      migrated,
      Date.parse('2026-01-01T00:00:00.000Z'),
    );
    const second = normalizePersistedState(first, Date.parse('2027-01-01T00:00:00.000Z'));

    expect(second).toEqual(first);
    expect(second.projects[0]?.setupScript).toBe('scoped script');
    expect(second.recentRepositories).toEqual([
      {
        repositoryId: 'stable-id',
        name: 'Repository',
        mainWorktreePath: '/current/main',
        lastOpenedPath: '/last/opened/linked',
        lastOpenedAt: '2025-06-07T08:09:10.000Z',
      },
    ]);
    expect(second.comparisonBaseOverrides['stable-id:/linked']).toEqual({
      sourceBranch: 'feature',
      targetBranch: 'release',
    });
  });

  it('normalizes malformed new state boundaries and duplicate IDs and paths', () => {
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
            repositoryId: 'recent-newer',
            name: 'Duplicate ID',
            mainWorktreePath: '/recent/other',
            lastOpenedPath: '/recent/other',
            lastOpenedAt: '2024-01-01T00:00:00Z',
          },
          {
            repositoryId: 'bad-path',
            name: 'Bad path',
            mainWorktreePath: 'relative',
            lastOpenedPath: '/valid',
            lastOpenedAt: '2026-01-01T00:00:00Z',
          },
          'invalid',
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

    expect(normalized.schemaVersion).toBe(currentStateSchemaVersion);
    expect(normalized.projects).toEqual([
      { id: 'repo', name: 'Repository', path: '/code/repo' },
    ]);
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

  it('normalizes malformed dates without inspecting missing repository paths', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-store-'));
    await writeFile(
      path.join(directory, 'grafter-state.json'),
      JSON.stringify({
        recentRepositories: [
          {
            repositoryId: 'missing',
            name: 'Missing repository',
            mainWorktreePath: '/definitely/not/a/repository',
            lastOpenedPath: '/also/missing',
            lastOpenedAt: 'not-a-date',
          },
        ],
      }),
      'utf8',
    );
    const store = new StateStore(directory, {
      now: () => Date.parse('2026-08-04T10:30:00.000Z'),
    });

    await expect(store.load()).resolves.toBeUndefined();

    expect(store.state.recentRepositories[0]?.lastOpenedAt).toBe(
      '2026-08-04T10:30:00.000Z',
    );
  });

  it('refuses a future schema instead of destructively downgrading it', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-store-'));
    await writeFile(
      path.join(directory, 'grafter-state.json'),
      JSON.stringify({ schemaVersion: currentStateSchemaVersion + 1 }),
      'utf8',
    );
    const store = new StateStore(directory);

    await expect(store.load()).rejects.toThrow('newer than this version');
  });

  it('dual-writes repository add, open, setup, comparison, and removal atomically', async () => {
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

    await store.addRepository(repository, '/repository.worktrees/feature');
    expect(store.state.projects).toEqual([repository]);
    expect(store.state.recentRepositories[0]).toMatchObject({
      repositoryId: 'repository',
      mainWorktreePath: '/repository',
      lastOpenedPath: '/repository.worktrees/feature',
      lastOpenedAt: '2026-08-04T12:00:00.000Z',
    });

    now += 60_000;
    await store.openRepository('repository', '/repository.worktrees/other');
    expect(store.state.recentRepositories[0]).toMatchObject({
      lastOpenedPath: '/repository.worktrees/other',
      lastOpenedAt: '2026-08-04T12:01:00.000Z',
    });

    await store.setRepositorySetupScript('repository', '  npm ci  ');
    expect(store.state.projects[0]?.setupScript).toBe('npm ci');
    expect(store.repositorySetupScript('repository')).toBe('npm ci');

    const worktreeId = 'repository:/repository.worktrees/feature';
    await store.setComparisonBaseOverride('repository', worktreeId, {
      sourceBranch: 'feature',
      targetBranch: 'main',
    });
    expect(store.state.comparisonBaseOverrides[worktreeId]).toEqual({
      sourceBranch: 'feature',
      targetBranch: 'main',
    });
    expect(store.comparisonBaseOverride('repository', worktreeId)).toEqual({
      sourceBranch: 'feature',
      targetBranch: 'main',
    });

    await store.removeRepository('repository');
    expect(store.state.projects).toEqual([]);
    expect(store.state.recentRepositories).toEqual([]);
    expect(store.state.repositoryPreferences).toEqual({});
    expect(persisted).toHaveLength(5);
  });

  it('persists simultaneous updates in invocation order with every mutation', async () => {
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

    const first = store.update((state) => state.projects.push(project('first')));
    const second = store.update((state) => state.projects.push(project('second')));
    const third = store.update((state) => state.projects.push(project('third')));

    await firstWriteStarted.promise;
    expect(persisted).toHaveLength(1);
    expect(store.state.projects).toEqual([]);
    releaseFirstWrite.resolve();
    await Promise.all([first, second, third]);

    expect(persisted.map((state) => state.projects.map((item) => item.id))).toEqual([
      ['first'],
      ['first', 'second'],
      ['first', 'second', 'third'],
    ]);
    expect(
      persisted.map((state) =>
        state.recentRepositories.map((repository) => repository.repositoryId),
      ),
    ).toEqual([['first'], ['second', 'first'], ['third', 'second', 'first']]);
    expect(store.state.projects.map((item) => item.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('does not publish a failed write and continues processing later updates', async () => {
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

    const failed = store.update((state) => state.projects.push(project('failed')));
    const succeeded = store.update((state) => state.projects.push(project('saved')));

    await expect(failed).rejects.toThrow('Disk full.');
    await expect(succeeded).resolves.toBeUndefined();
    expect(store.state.projects.map((item) => item.id)).toEqual(['saved']);
    expect(store.state.recentRepositories.map((item) => item.repositoryId)).toEqual([
      'saved',
    ]);
    expect(persisted[0]?.projects.map((item) => item.id)).toEqual(['saved']);
    expect(persisted[0]?.recentRepositories.map((item) => item.repositoryId)).toEqual([
      'saved',
    ]);
  });

  it('continues processing after a mutator throws', async () => {
    const persisted: PersistedState[] = [];
    const store = new StateStore('/state', {
      persist: (_file, state) => {
        persisted.push(structuredClone(state));
        return Promise.resolve();
      },
    });

    const failed = store.update(() => {
      throw new Error('Invalid mutation.');
    });
    const succeeded = store.update((state) => state.projects.push(project('saved')));

    await expect(failed).rejects.toThrow('Invalid mutation.');
    await expect(succeeded).resolves.toBeUndefined();
    expect(persisted).toHaveLength(1);
    expect(store.state.projects.map((item) => item.id)).toEqual(['saved']);
  });
});

function project(id: string): PersistedState['projects'][number] {
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
