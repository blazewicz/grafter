import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Worktree } from '../src/shared/contracts';
import { CommandRunner } from '../src/main/commands';
import { GitService } from '../src/main/git-service';

describe('GitService worktree status', () => {
  it('reports clean and dirty using porcelain status including untracked files', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-status-'));
    const runner = new CommandRunner(() => undefined);
    const initialized = await runner.run({
      tool: 'git',
      executable: 'git',
      args: ['init'],
      cwd: directory,
      purpose: 'Initialize test repository',
    });
    expect(initialized.record.exitCode).toBe(0);

    const worktree: Worktree = {
      id: `project:${directory}`,
      projectId: 'project',
      path: directory,
      branch: 'main',
      head: '',
      isMain: true,
      locked: false,
    };
    const service = new GitService(runner);

    await expect(service.status(worktree)).resolves.toBe('clean');
    await writeFile(path.join(directory, 'untracked.txt'), 'local change\n');
    await expect(service.status(worktree)).resolves.toBe('dirty');

    const statusCommands = runner.records.filter((record) =>
      record.purpose.endsWith('worktree status'),
    );
    expect(statusCommands).toHaveLength(2);
    expect(statusCommands[0]?.args).toEqual([
      'status',
      '--porcelain=v1',
      '--untracked-files=normal',
    ]);
  });
});
