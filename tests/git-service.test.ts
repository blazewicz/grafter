import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Project, Worktree } from '../src/shared/contracts';
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
      isReadOnly: false,
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
    expect(statusCommands.every((record) => record.isReadOnly)).toBe(true);
    expect(statusCommands[0]?.args).toEqual([
      'status',
      '--porcelain=v1',
      '--untracked-files=normal',
    ]);
  });
});

describe('GitService worktree details', () => {
  it('does not compare a worktree with the branch it already targets', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-details-'));
    const runner = new CommandRunner(() => undefined);
    const initialized = await runner.run({
      tool: 'git',
      executable: 'git',
      args: ['init', '--initial-branch=main'],
      cwd: directory,
      purpose: 'Initialize test repository',
      isReadOnly: false,
    });
    expect(initialized.record.exitCode).toBe(0);

    const project: Project = {
      id: 'project',
      name: 'project',
      path: directory,
    };
    const worktree: Worktree = {
      id: `project:${directory}`,
      projectId: project.id,
      path: directory,
      branch: 'main',
      head: '',
      isMain: true,
      locked: false,
    };
    const service = new GitService(runner);

    await expect(service.details(project, worktree)).resolves.toMatchObject({
      targetBranch: 'main',
      diff: { files: 0, additions: 0, deletions: 0 },
    });
    expect(runner.records.some((record) => record.purpose === 'Compare with main')).toBe(
      false,
    );
  });
});
