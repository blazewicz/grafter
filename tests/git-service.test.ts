import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  projectCommandContext,
  worktreeCommandContext,
} from '../src/shared/command-context';
import type { Project, Worktree } from '../src/shared/contracts';
import { CommandRunner } from '../src/main/commands';
import { GitService } from '../src/main/git-service';
import { StubCommandRunner } from './stub-command-runner';

describe('GitService worktree status', () => {
  it('reports clean and dirty using porcelain status including untracked files', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-status-'));
    const runner = new CommandRunner(() => undefined);
    const initialized = await runner.run({
      context: { kind: 'application' },
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
      name: path.basename(directory),
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

    const statusCommands = runner
      .recordsFor(worktreeCommandContext(worktree))
      .filter((record) => record.purpose.endsWith('worktree status'));
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
      context: { kind: 'application' },
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
      name: path.basename(directory),
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
    const worktreeCommands = runner.recordsFor(worktreeCommandContext(worktree));
    expect(
      worktreeCommands.some((record) => record.purpose === 'Compare with main'),
    ).toBe(false);
    expect(
      worktreeCommands.every(
        (record) =>
          record.context.kind === 'worktree' && record.context.worktreeId === worktree.id,
      ),
    ).toBe(true);
  });

  it('retains removal in the project log after the target worktree disappears', () => {
    const runner = new CommandRunner(() => undefined);
    const service = new GitService(runner);
    const project: Project = {
      id: 'project',
      name: 'project',
      path: '/repo',
    };
    const worktree: Worktree = {
      id: 'project:/repo.worktrees/feature',
      projectId: project.id,
      name: 'feature',
      path: '/repo.worktrees/feature',
      branch: 'feature',
      head: '',
      isMain: false,
      locked: false,
    };

    const spec = service.removeSpec(project, worktree);
    const record = runner.createPending(spec);

    expect(spec.cwd).toBe(project.path);
    expect(spec.context).toEqual(projectCommandContext(project));
    expect(runner.recordsFor(projectCommandContext(project))).toEqual([record]);
    expect(runner.recordsFor(worktreeCommandContext(worktree))).toEqual([]);
  });
});

describe('GitService pull request loading', () => {
  it('limits concurrent GitHub lookups to five', async () => {
    const project: Project = {
      id: 'project',
      name: 'project',
      path: '/repo',
    };
    const worktreeOutput = Array.from(
      { length: 12 },
      (_, index) => `worktree /repo.worktrees/branch-${index}
HEAD ${String(index).padStart(7, '0')}
branch refs/heads/branch-${index}`,
    ).join('\n\n');
    let active = 0;
    let maximumActive = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: worktreeOutput };
      }
      if (spec.tool === 'git' && spec.args[0] === 'symbolic-ref') {
        return { stdout: 'origin/main\n' };
      }
      if (spec.tool === 'github') {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return { exitCode: 1 };
      }
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });

    await new GitService(runner).listBranchWorkspaces(project);

    expect(maximumActive).toBe(5);
  });
});
