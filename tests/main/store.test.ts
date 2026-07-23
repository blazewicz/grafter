import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { StateStore } from '../../src/main/store';
import type { PersistedState } from '../../src/main/store';

describe('StateStore', () => {
  it('uses the default worktree template and persists updates atomically', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-store-'));
    const store = new StateStore(directory);
    await store.load();
    expect(store.state.settings.defaultWorktreePath).toBe('../<repo_name>.worktrees');
    expect(store.state.settings.dateFormat).toBe('system');
    expect(store.state.settings.timeFormat).toBe('system');
    expect(store.state.comparisonBaseOverrides).toEqual({});

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
    expect(persisted[0]?.projects.map((item) => item.id)).toEqual(['saved']);
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
