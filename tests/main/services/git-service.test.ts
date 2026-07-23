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
      execution: { admission: 'limited' },
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
      execution: {
        admission: 'limited',
        timeoutMs: GitService.commandTimeoutMs,
      },
      executable: 'git',
      args: ['switch', '--no-guess', '--', 'feature/new'],
      cwd: worktree.path,
      purpose: 'Switch b77c/feature to feature/new',
      isReadOnly: false,
    });
  });

  it('runs project setup shells without automated admission or timeout policy', () => {
    const spec = new GitService(new StubCommandRunner(() => ({}))).setupSpec(
      worktree,
      'npm install',
    );

    expect(spec.execution).toEqual({ admission: 'direct' });
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
      execution: { admission: 'limited' },
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

  it('falls back to the default branch when a pull request base is unavailable locally', async () => {
    const project: Project = { id: 'project', name: 'project', path: '/repo' };
    const worktree: Worktree = {
      id: 'project:/repo.worktrees/stacked',
      projectId: project.id,
      displayName: 'stacked',
      path: '/repo.worktrees/stacked',
      branch: 'feature/stacked',
      pullRequest: {
        number: 19,
        title: 'Stacked pull request',
        url: 'https://github.com/example/project/pull/19',
        state: 'OPEN',
        baseBranch: 'feature/merged-base',
      },
      head: '1234567',
      isMain: false,
      locked: false,
    };
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'log') {
        return {
          stdout:
            '1234567890abcdef\nAda Lovelace\n\n2026-07-19T14:25:00+02:00\nStacked pull request\n\u0000\n',
        };
      }
      if (spec.args[0] === 'symbolic-ref') return { stdout: 'origin/main\n' };
      if (spec.args[0] === 'diff') {
        if (spec.args[2] === 'main...HEAD') return { stdout: '4\t1\tsrc/example.ts\n' };
        return { exitCode: 128, stderr: 'fatal: ambiguous argument' };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });

    await expect(
      new GitService(runner).details(project, worktree),
    ).resolves.toMatchObject({
      automaticBaseBranch: 'feature/merged-base',
      automaticBaseBranchUnavailable: true,
      targetBranch: 'main',
      diff: { files: 1, additions: 4, deletions: 1 },
    });
    expect(
      runner.commands
        .filter((command) => command.args[0] === 'diff')
        .map((command) => command.args[2]),
    ).toEqual([
      'feature/merged-base...HEAD',
      'origin/feature/merged-base...HEAD',
      'main...HEAD',
    ]);
  });

  it('keeps the pull request base warning when no fallback branch is available', async () => {
    const project: Project = { id: 'project', name: 'project', path: '/repo' };
    const worktree: Worktree = {
      id: 'project:/repo.worktrees/stacked',
      projectId: project.id,
      displayName: 'stacked',
      path: '/repo.worktrees/stacked',
      branch: 'feature/stacked',
      pullRequest: {
        number: 19,
        title: 'Stacked pull request',
        url: 'https://github.com/example/project/pull/19',
        state: 'OPEN',
        baseBranch: 'feature/merged-base',
      },
      head: '1234567',
      isMain: false,
      locked: false,
    };
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'symbolic-ref') return { exitCode: 1 };
      if (spec.args[0] === 'diff') return { exitCode: 128 };
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });

    await expect(new GitService(runner).comparison(project, worktree)).resolves.toEqual({
      automaticBaseBranch: 'feature/merged-base',
      automaticBaseBranchUnavailable: true,
    });
  });

  it('reports an unavailable saved comparison override without changing it', async () => {
    const project: Project = { id: 'project', name: 'project', path: '/repo' };
    const worktree: Worktree = {
      id: 'project:/repo.worktrees/feature',
      projectId: project.id,
      displayName: 'feature',
      path: '/repo.worktrees/feature',
      branch: 'feature/change',
      head: '1234567',
      isMain: false,
      locked: false,
    };
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'symbolic-ref') return { stdout: 'origin/main\n' };
      if (spec.args[0] === 'diff') return { exitCode: 128 };
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });

    await expect(
      new GitService(runner).comparison(project, worktree, 'release/next'),
    ).resolves.toEqual({
      automaticBaseBranch: 'main',
      targetBranch: 'release/next',
      comparisonBaseOverride: 'release/next',
      comparisonBaseOverrideUnavailable: true,
    });
    expect(
      runner.commands
        .filter((command) => command.args[0] === 'diff')
        .map((command) => command.args[2]),
    ).toEqual(['release/next...HEAD', 'origin/release/next...HEAD']);
  });

  it('uses an explicit comparison base while retaining the automatic PR base', async () => {
    const project: Project = { id: 'project', name: 'project', path: '/repo' };
    const worktree: Worktree = {
      id: 'project:/repo.worktrees/feature',
      projectId: project.id,
      displayName: 'feature',
      path: '/repo.worktrees/feature',
      branch: 'feature/change',
      pullRequest: {
        number: 18,
        title: 'Feature change',
        url: 'https://github.com/example/project/pull/18',
        state: 'OPEN',
        baseBranch: 'main',
      },
      head: '1234567',
      isMain: false,
      locked: false,
    };
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'diff') return { stdout: '5\t2\tsrc/example.ts\n' };
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });

    await expect(
      new GitService(runner).comparison(project, worktree, 'release/next'),
    ).resolves.toEqual({
      automaticBaseBranch: 'main',
      targetBranch: 'release/next',
      comparisonBaseOverride: 'release/next',
      diff: { files: 1, additions: 5, deletions: 2 },
    });
    expect(runner.commands.some((command) => command.args[0] === 'symbolic-ref')).toBe(
      false,
    );
  });

  it('keeps independent detail reads concurrent', async () => {
    const project: Project = {
      id: 'project',
      name: 'project',
      path: '/repo',
    };
    const worktree: Worktree = {
      id: 'project:/repo.worktrees/concurrent',
      projectId: project.id,
      displayName: 'concurrent',
      path: '/repo.worktrees/concurrent',
      branch: 'feature/concurrent',
      head: '1234567',
      isMain: false,
      locked: false,
    };
    const started = new Set<string>();
    let resolveBothStarted: (() => void) | undefined;
    let releaseReads: (() => void) | undefined;
    const bothStarted = new Promise<void>((resolve) => {
      resolveBothStarted = resolve;
    });
    const readGate = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const runner = new StubCommandRunner(async (spec) => {
      const command = spec.args[0] ?? '';
      if (command === 'log' || command === 'symbolic-ref') {
        started.add(command);
        if (started.size === 2) resolveBothStarted?.();
        await readGate;
      }
      if (command === 'log') {
        return {
          stdout:
            '1234567890abcdef\nAda Lovelace\n\n2026-07-19T14:25:00+02:00\nConcurrent details\n\u0000\n',
        };
      }
      if (command === 'symbolic-ref') return { stdout: 'origin/main\n' };
      if (command === 'diff') return { stdout: '' };
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const details = new GitService(runner).details(project, worktree);

    await bothStarted;
    expect(started).toEqual(new Set(['log', 'symbolic-ref']));
    releaseReads?.();
    await expect(details).resolves.toMatchObject({ targetBranch: 'main' });
  });

  it('starts comparison stats before delayed commit metadata finishes', async () => {
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
      branch: 'feature/concurrent',
      head: '1234567',
      isMain: false,
      locked: false,
    };
    const commitResult = deferred<{ stdout: string }>();
    const diffStarted = deferred<void>();
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'log') return commitResult.promise;
      if (spec.args[0] === 'symbolic-ref') return { stdout: 'origin/main\n' };
      if (spec.args[0] === 'diff') {
        diffStarted.resolve();
        return { stdout: '2\t1\tsrc/example.ts\n' };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });

    const details = new GitService(runner).details(project, worktree);
    await diffStarted.promise;
    expect(runner.commands.some((command) => command.args[0] === 'diff')).toBe(true);
    commitResult.resolve({
      stdout:
        '1234567890abcdef\nAda Lovelace\n\n2026-07-19T14:25:00+02:00\nConcurrent details\n\u0000\n',
    });

    await expect(details).resolves.toMatchObject({
      targetBranch: 'main',
      diff: { files: 1, additions: 2, deletions: 1 },
    });
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

describe('GitService committed diff sessions', () => {
  const project: Project = {
    id: 'project',
    name: 'repo',
    path: '/repo',
  };
  const worktree: Worktree = {
    id: 'project:/repo.worktrees/feature',
    projectId: project.id,
    displayName: 'feature',
    path: '/repo.worktrees/feature',
    branch: 'feature/diff-viewer',
    head: '2222222',
    isMain: false,
    locked: false,
  };

  it('opens an exact commit against its first parent without editor access', async () => {
    const commitHash = '1234567890abcdef1234567890abcdef12345678';
    const firstParent = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const secondParent = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'rev-parse') return { stdout: `${commitHash}\n` };
      if (spec.args[0] === 'show') {
        return { stdout: `${firstParent} ${secondParent}\n` };
      }
      if (spec.args[0] === 'log') {
        return {
          stdout: `${commitHash}\nAda Lovelace\nada@example.com\n2026-07-21T12:30:00+02:00\nMerge the viewer\nExplain the merge.\n\u0000\n9\t2\tsrc/viewer.ts\n`,
        };
      }
      if (spec.args[0] === 'remote') return { stdout: '' };
      if (spec.args.includes('--name-status')) {
        return { stdout: 'M\0src/viewer.ts\0' };
      }
      if (spec.args.includes('--numstat')) {
        return { stdout: '9\t2\tsrc/viewer.ts\0' };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const service = new GitService(runner);

    const session = await service.openCommitDiff(project, commitHash);

    expect(session).toMatchObject({
      kind: 'commit',
      projectId: project.id,
      baseSha: firstParent,
      headSha: commitHash,
      parentShas: [firstParent, secondParent],
      stats: { files: 1, additions: 9, deletions: 2 },
      commit: {
        hash: commitHash,
        title: 'Merge the viewer',
        body: 'Explain the merge.',
        stats: { files: 1, additions: 9, deletions: 2 },
      },
    });
    expect(runner.commands).toContainEqual(
      expect.objectContaining({
        context: projectCommandContext(project),
        cwd: project.path,
        args: ['diff', '--name-status', '-z', '--find-renames', firstParent, commitHash],
      }),
    );
    expect(() =>
      service.diffFilePath({ sessionId: session.id, fileId: 'file-0' }),
    ).toThrow('Check out the source branch in a worktree');
  });

  it('starts commit diff contents before delayed commit metadata finishes', async () => {
    const commitHash = '1234567890abcdef1234567890abcdef12345678';
    const firstParent = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const commitResult = deferred<{ stdout: string }>();
    const diffStarted = deferred<void>();
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'rev-parse') return { stdout: `${commitHash}\n` };
      if (spec.args[0] === 'show') return { stdout: `${firstParent}\n` };
      if (spec.args[0] === 'log') return commitResult.promise;
      if (spec.args[0] === 'remote') return { stdout: '' };
      if (spec.args.includes('--name-status')) {
        diffStarted.resolve();
        return { stdout: '' };
      }
      if (spec.args.includes('--numstat')) return { stdout: '' };
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const service = new GitService(runner);

    const session = service.openCommitDiff(project, commitHash);
    await diffStarted.promise;
    expect(
      runner.commands.some((command) => command.args.includes('--name-status')),
    ).toBe(true);
    commitResult.resolve({
      stdout: `${commitHash}\nAda Lovelace\nada@example.com\n2026-07-21T12:30:00+02:00\nConcurrent commit\n\u0000\n`,
    });

    await expect(session).resolves.toMatchObject({
      baseSha: firstParent,
      headSha: commitHash,
      commit: { title: 'Concurrent commit' },
    });
  });

  it('opens a root commit against the repository empty tree', async () => {
    const commitHash = '1234567890abcdef1234567890abcdef12345678';
    const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'rev-parse') return { stdout: `${commitHash}\n` };
      if (spec.args[0] === 'show') return { stdout: '\n' };
      if (spec.args[0] === 'log') {
        return {
          stdout: `${commitHash}\nAda Lovelace\nada@example.com\n2026-07-21T12:30:00+02:00\nInitial commit\n\u0000\n`,
        };
      }
      if (spec.args[0] === 'hash-object') return { stdout: `${emptyTree}\n` };
      if (spec.args[0] === 'remote') return { stdout: '' };
      if (spec.args.includes('--name-status') || spec.args.includes('--numstat')) {
        return { stdout: '' };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });

    const session = await new GitService(runner).openCommitDiff(project, commitHash);

    expect(session).toMatchObject({
      kind: 'commit',
      baseSha: emptyTree,
      headSha: commitHash,
      parentShas: [],
      stats: { files: 0, additions: 0, deletions: 0 },
    });
  });

  it('pins the comparison revisions and loads validated files individually', async () => {
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'symbolic-ref') return { stdout: 'origin/main\n' };
      if (spec.args[0] === 'rev-parse') return { stdout: 'head-sha\n' };
      if (spec.args[0] === 'merge-base') return { stdout: 'base-sha\n' };
      if (spec.args[0] === 'remote') {
        return {
          stdout:
            'origin\tgit@github.com:example/grafter.git (fetch)\n' +
            'origin\tgit@github.com:example/grafter.git (push)\n',
        };
      }
      if (spec.args.includes('--name-status')) {
        return {
          stdout:
            'M\0src/renderer/App.tsx\0R090\0src/old name.ts\0src/new name.ts\0A\0assets/image.png\0',
        };
      }
      if (spec.args.includes('--numstat')) {
        return {
          stdout:
            '4\t1\tsrc/renderer/App.tsx\0' +
            '2\t2\t\0src/old name.ts\0src/new name.ts\0' +
            '-\t-\tassets/image.png\0',
        };
      }
      if (spec.args.includes('--unified=3')) {
        return {
          stdout: `@@ -1,2 +1,2 @@
-import { old } from './old';
+import { next } from './next';
 export {};
`,
        };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const service = new GitService(runner);

    const session = await service.openDiff(project, worktree);
    expect(session).toMatchObject({
      projectId: project.id,
      sourceWorktreeId: worktree.id,
      branch: 'feature/diff-viewer',
      targetBranch: 'main',
      baseSha: 'base-sha',
      headSha: 'head-sha',
      githubRepository: { owner: 'example', name: 'grafter' },
      stats: { files: 3, additions: 6, deletions: 3 },
    });
    expect(session.files[1]).toMatchObject({
      path: 'src/new name.ts',
      previousPath: 'src/old name.ts',
      status: 'renamed',
    });
    expect(runner.commands).toContainEqual({
      context: worktreeCommandContext(worktree),
      tool: 'git',
      execution: {
        admission: 'limited',
        timeoutMs: GitService.commandTimeoutMs,
      },
      executable: 'git',
      args: ['remote', '-v'],
      cwd: worktree.path,
      purpose: 'Find GitHub remote',
      isReadOnly: true,
    });
    expect(service.diffFilePath({ sessionId: session.id, fileId: 'file-0' })).toBe(
      '/repo.worktrees/feature/src/renderer/App.tsx',
    );
    expect(service.diffFilePath({ sessionId: session.id, fileId: 'file-1' })).toBe(
      '/repo.worktrees/feature/src/new name.ts',
    );

    await expect(
      service.diffFile({ sessionId: session.id, fileId: 'file-1' }),
    ).resolves.toMatchObject({
      fileId: 'file-1',
      hunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: [
            { kind: 'deletion', oldLine: 1 },
            { kind: 'addition', newLine: 1 },
            { kind: 'context', oldLine: 2, newLine: 2 },
          ],
        },
      ],
    });
    expect(runner.commands.at(-1)?.args.slice(-3)).toEqual([
      '--',
      'src/old name.ts',
      'src/new name.ts',
    ]);

    const commandCount = runner.commands.length;
    await expect(
      service.diffFile({ sessionId: session.id, fileId: 'file-2' }),
    ).resolves.toEqual({ fileId: 'file-2', binary: true, hunks: [] });
    expect(runner.commands).toHaveLength(commandCount);
  });

  it('bounds concurrent file patch reads without serializing them', async () => {
    const fileCount = 10;
    let active = 0;
    let maximumActive = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.args[0] === 'rev-parse') return { stdout: 'head-sha\n' };
      if (spec.args[0] === 'merge-base') return { stdout: 'base-sha\n' };
      if (spec.args[0] === 'remote') return { stdout: '' };
      if (spec.args.includes('--name-status')) {
        return {
          stdout: Array.from(
            { length: fileCount },
            (_, index) => `M\0src/file-${index}.ts\0`,
          ).join(''),
        };
      }
      if (spec.args.includes('--numstat')) {
        return {
          stdout: Array.from(
            { length: fileCount },
            (_, index) => `1\t0\tsrc/file-${index}.ts\0`,
          ).join(''),
        };
      }
      if (spec.args.includes('--unified=3')) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return { stdout: '@@ -0,0 +1 @@\n+export {};\n' };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const service = new GitService(runner);
    const session = await service.openBranchDiff(project, 'feature', 'main');

    const patches = await Promise.all(
      session.files.map((file) =>
        service.diffFile({ sessionId: session.id, fileId: file.id }),
      ),
    );

    expect(patches).toHaveLength(fileCount);
    expect(maximumActive).toBe(GitService.maximumConcurrentDiffFileReads);
  });

  it('revalidates a diff session when a queued patch read is admitted', async () => {
    let active = 0;
    let resolveLimitReached: (() => void) | undefined;
    let releaseReads: (() => void) | undefined;
    const limitReached = new Promise<void>((resolve) => {
      resolveLimitReached = resolve;
    });
    const readGate = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.args[0] === 'rev-parse') return { stdout: 'head-sha\n' };
      if (spec.args[0] === 'merge-base') return { stdout: 'base-sha\n' };
      if (spec.args[0] === 'remote') return { stdout: '' };
      if (spec.args.includes('--name-status')) {
        return { stdout: 'M\0a.ts\0M\0b.ts\0M\0c.ts\0M\0d.ts\0' };
      }
      if (spec.args.includes('--numstat')) {
        return {
          stdout:
            '1\t0\ta.ts\u0000' +
            '1\t0\tb.ts\u0000' +
            '1\t0\tc.ts\u0000' +
            '1\t0\td.ts\u0000',
        };
      }
      if (spec.args.includes('--unified=3')) {
        active += 1;
        if (active === GitService.maximumConcurrentDiffFileReads) {
          resolveLimitReached?.();
        }
        await readGate;
        return { stdout: '@@ -0,0 +1 @@\n+export {};\n' };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const service = new GitService(runner);
    const session = await service.openBranchDiff(project, 'feature', 'main');
    const reads = session.files.map((file) =>
      service.diffFile({ sessionId: session.id, fileId: file.id }),
    );

    await limitReached;
    service.closeDiff(session.id);
    releaseReads?.();
    const results = await Promise.allSettled(reads);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
      GitService.maximumConcurrentDiffFileReads,
    );
    const queued = results.at(-1);
    expect(queued?.status).toBe('rejected');
    if (queued?.status === 'rejected') {
      const reason = queued.reason as unknown;
      expect(reason).toBeInstanceOf(Error);
      if (reason instanceof Error) expect(reason.message).toContain('session expired');
    }
  });

  it('compares arbitrary local branches without inventing an editor worktree', async () => {
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'rev-parse') return { stdout: 'source-sha\n' };
      if (spec.args[0] === 'merge-base') return { stdout: 'base-sha\n' };
      if (spec.args[0] === 'remote') return { stdout: '' };
      if (spec.args.includes('--name-status')) {
        return { stdout: 'M\0src/example.ts\0' };
      }
      if (spec.args.includes('--numstat')) {
        return { stdout: '2\t1\tsrc/example.ts\0' };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const service = new GitService(runner);

    const session = await service.openBranchDiff(
      project,
      'feature/not-checked-out',
      'release/next',
    );

    expect(session).toMatchObject({
      projectId: project.id,
      branch: 'feature/not-checked-out',
      targetBranch: 'release/next',
      baseSha: 'base-sha',
      headSha: 'source-sha',
    });
    expect(session).not.toHaveProperty('sourceWorktreeId');
    expect(runner.commands[0]).toMatchObject({
      context: projectCommandContext(project),
      cwd: project.path,
      args: ['rev-parse', '--verify', 'refs/heads/feature/not-checked-out'],
    });
    expect(() =>
      service.diffFilePath({ sessionId: session.id, fileId: 'file-0' }),
    ).toThrow('Check out the source branch in a worktree');
  });

  it('rejects a comparison of a branch with itself', async () => {
    const service = new GitService(new StubCommandRunner(() => ({})));

    await expect(service.openBranchDiff(project, 'main', 'main')).rejects.toThrow(
      'two different branches',
    );
  });

  it('rejects files outside the immutable session and expires closed sessions', async () => {
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'symbolic-ref') return { stdout: 'origin/main\n' };
      if (spec.args[0] === 'rev-parse') return { stdout: 'head-sha\n' };
      if (spec.args[0] === 'merge-base') return { stdout: 'base-sha\n' };
      if (spec.args[0] === 'remote') return { exitCode: 2 };
      if (spec.args.includes('--name-status')) {
        return { stdout: 'M\0src/example.ts\0' };
      }
      if (spec.args.includes('--numstat')) {
        return { stdout: '1\t0\tsrc/example.ts\0' };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const service = new GitService(runner);
    const session = await service.openDiff(project, worktree);

    await expect(
      service.diffFile({ sessionId: session.id, fileId: '../../etc/passwd' }),
    ).rejects.toThrow('not part of this diff');
    expect(() =>
      service.diffFilePath({ sessionId: session.id, fileId: '../../etc/passwd' }),
    ).toThrow('not part of this diff');
    service.closeDiff(session.id);
    await expect(
      service.diffFile({ sessionId: session.id, fileId: 'file-0' }),
    ).rejects.toThrow('session expired');
    expect(() =>
      service.diffFilePath({ sessionId: session.id, fileId: 'file-0' }),
    ).toThrow('session expired');
  });

  it('does not open deleted files or paths outside the worktree', async () => {
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'symbolic-ref') return { stdout: 'origin/main\n' };
      if (spec.args[0] === 'rev-parse') return { stdout: 'head-sha\n' };
      if (spec.args[0] === 'merge-base') return { stdout: 'base-sha\n' };
      if (spec.args[0] === 'remote') return { stdout: '' };
      if (spec.args.includes('--name-status')) {
        return { stdout: 'D\0src/deleted.ts\0M\0../outside.ts\0' };
      }
      if (spec.args.includes('--numstat')) {
        return { stdout: '0\t3\tsrc/deleted.ts\0' + '1\t1\t../outside.ts\0' };
      }
      throw new Error(`Unexpected command: ${spec.args.join(' ')}`);
    });
    const service = new GitService(runner);
    const session = await service.openDiff(project, worktree);

    expect(() =>
      service.diffFilePath({ sessionId: session.id, fileId: 'file-0' }),
    ).toThrow('Deleted files cannot be opened');
    expect(() =>
      service.diffFilePath({ sessionId: session.id, fileId: 'file-1' }),
    ).toThrow('outside its worktree');
  });
});

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
