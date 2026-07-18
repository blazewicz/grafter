import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { StateStore } from '../../src/main/store';

describe('StateStore', () => {
  it('uses the default worktree template and persists updates atomically', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-store-'));
    const store = new StateStore(directory);
    await store.load();
    expect(store.state.settings.defaultWorktreePath).toBe('../<repo_name>.worktrees');
    expect(store.state.settings.dateFormat).toBe('system');
    expect(store.state.settings.timeFormat).toBe('system');

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
  });
});
