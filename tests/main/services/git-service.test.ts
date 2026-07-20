import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  projectCommandContext,
  worktreeCommandContext,
} from '../../../src/shared/command-context';
import type { Project, Worktree } from '../../../src/shared/contracts';
import { CommandRunner } from '../../../src/main/commands';
import { GitService } from '../../../src/main/services/git-service';
import { StubCommandRunner } from '../support/stub-command-runner';

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
      displayName: 'main',
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

describe('GitService branch operations', () => {
  const project: Project = {
    id: 'project',
    name: 'project',
    path: '/repo',
  };
  const worktree: Worktree = {
    id: 'project:/repo.worktrees/feature',
    projectId: project.id,
    displayName: 'b77c/feature',
    path: '/repo.worktrees/feature',
    branch: 'feature/old',
    head: '1234567',
    isMain: false,
    locked: false,
  };

  it('lists only local branches and sorts them', async () => {
    const runner = new StubCommandRunner(() => ({
      stdout: 'release/0.1\nmain\nfeature/new\n',
    }));

    await expect(new GitService(runner).listBranches(project)).resolves.toEqual([
      'feature/new',
      'main',
      'release/0.1',
    ]);
    expect(runner.commands[0]).toMatchObject({
      args: ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      cwd: project.path,
      isReadOnly: true,
    });
  });

  it('switches with an argument array in the worktree context', async () => {
    const runner = new StubCommandRunner(() => ({}));

    await new GitService(runner).switchBranch(worktree, 'feature/new');

    expect(runner.commands[0]).toEqual({
      context: worktreeCommandContext(worktree),
      tool: 'git',
      executable: 'git',
      args: ['switch', '--no-guess', '--', 'feature/new'],
      cwd: worktree.path,
      purpose: 'Switch b77c/feature to feature/new',
      isReadOnly: false,
    });
  });

  it('does not create or track a branch while adding a worktree', async () => {
    const runner = new StubCommandRunner(() => ({}));

    await new GitService(runner).addWorktree(
      project,
      '/repo.worktrees/feature-new',
      'feature/new',
    );

    expect(runner.commands[0]?.args).toEqual([
      'worktree',
      'add',
      '/repo.worktrees/feature-new',
      'feature/new',
    ]);
  });

  it('surfaces a switch rejected by Git', async () => {
    const runner = new StubCommandRunner(() => ({
      exitCode: 1,
      stderr: 'Your local changes would be overwritten by checkout.',
    }));

    await expect(
      new GitService(runner).switchBranch(worktree, 'feature/new'),
    ).rejects.toThrow('Your local changes would be overwritten by checkout.');
  });
});

describe('GitService worktree details', () => {
  it('omits comparison data when remote HEAD is unknown', async () => {
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
      displayName: 'main',
      path: directory,
      branch: 'main',
      head: '',
      isMain: true,
      locked: false,
    };
    const service = new GitService(runner);

    await expect(service.details(project, worktree)).resolves.not.toHaveProperty(
      'targetBranch',
    );
    const worktreeCommands = runner.recordsFor(worktreeCommandContext(worktree));
    expect(
      worktreeCommands.some((record) => record.purpose.startsWith('Compare with')),
    ).toBe(false);
    expect(
      worktreeCommands.every(
        (record) =>
          record.context.kind === 'worktree' && record.context.worktreeId === worktree.id,
      ),
    ).toBe(true);
  });

  it('compares against a known remote HEAD only when it differs from the branch', async () => {
    const project: Project = {
      id: 'project',
      name: 'project',
      path: '/repo',
    };
    const baseWorktree: Worktree = {
      id: 'project:/repo.worktrees/feature',
      projectId: project.id,
      displayName: 'feature',
      path: '/repo.worktrees/feature',
      branch: 'feature',
      head: '1234567',
      isMain: false,
      locked: false,
    };
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'log') {
        return {
          stdout:
            '1234567890abcdef\nAda Lovelace\nada@example.com\n2026-07-19T14:25:00+02:00\nAdd commit details\nExplain the intent.\n\u0000\n8\t2\tsrc/details.ts\n',
        };
      }
      if (spec.args[0] === 'symbolic-ref') return { stdout: 'origin/main\n' };
      if (spec.args[0] === 'diff') return { stdout: '3\t1\tsrc/example.ts\n' };
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const service = new GitService(runner);

    await expect(service.details(project, baseWorktree)).resolves.toMatchObject({
      commit: {
        hash: '1234567890abcdef',
        title: 'Add commit details',
        body: 'Explain the intent.',
        authorName: 'Ada Lovelace',
        authorEmail: 'ada@example.com',
        authoredAt: '2026-07-19T14:25:00+02:00',
        stats: { files: 1, additions: 8, deletions: 2 },
      },
      targetBranch: 'main',
      diff: { files: 1, additions: 3, deletions: 1 },
    });
    expect(runner.commands.find((command) => command.args[0] === 'log')?.args).toEqual([
      'log',
      '-1',
      '--numstat',
      '--diff-merges=first-parent',
      '--format=%H%n%an%n%ae%n%aI%n%s%n%b%x00',
      'HEAD',
    ]);

    const mainWorktree = {
      ...baseWorktree,
      id: 'project:/repo',
      displayName: 'main',
      path: '/repo',
      branch: 'main',
      isMain: true,
    };
    await expect(service.details(project, mainWorktree)).resolves.not.toHaveProperty(
      'targetBranch',
    );
    expect(
      runner.commands.filter(
        (command) =>
          command.context.kind === 'worktree' &&
          command.context.worktreeId === mainWorktree.id &&
          command.args[0] === 'diff',
      ),
    ).toHaveLength(0);
  });

  it('prefers a loaded pull request target without resolving remote HEAD', async () => {
    const project: Project = {
      id: 'project',
      name: 'project',
      path: '/repo',
    };
    const worktree: Worktree = {
      id: 'project:/repo',
      projectId: project.id,
      displayName: 'main',
      path: '/repo',
      branch: 'feature/from-main-clone',
      pullRequest: {
        number: 18,
        title: 'Main clone pull request',
        url: 'https://github.com/example/project/pull/18',
        state: 'OPEN',
        baseBranch: 'release',
      },
      head: '1234567',
      isMain: true,
      locked: false,
    };
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'log') {
        return {
          stdout:
            '1234567890abcdef\nAda Lovelace\n\n2026-07-19T14:25:00+02:00\nTitle only\n\u0000\n2\t0\tsrc/example.ts\n',
        };
      }
      if (spec.args[0] === 'diff') return { stdout: '2\t0\tsrc/example.ts\n' };
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });

    await expect(
      new GitService(runner).details(project, worktree),
    ).resolves.toMatchObject({
      targetBranch: 'release',
      diff: { files: 1, additions: 2, deletions: 0 },
    });
    expect(runner.commands.some((command) => command.args[0] === 'symbolic-ref')).toBe(
      false,
    );
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
      displayName: 'feature',
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
