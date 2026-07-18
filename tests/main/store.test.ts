import { mkdtemp, readFile } from 'node:fs/promises';
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

    await store.update((state) => {
      state.settings.defaultWorktreePath = '/worktrees/<repo_name>';
    });

    const saved = JSON.parse(
      await readFile(path.join(directory, 'grafter-state.json'), 'utf8'),
    ) as { settings: { defaultWorktreePath: string } };
    expect(saved.settings.defaultWorktreePath).toBe('/worktrees/<repo_name>');
  });
});
