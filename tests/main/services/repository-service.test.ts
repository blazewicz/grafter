import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRuntime } from '../../../src/main/application-runtime';
import { RepositoryService } from '../../../src/main/services/repository-service';
import { StateStore } from '../../../src/main/store';
import type { DiffSession, ProjectConfig } from '../../../src/shared/contracts';
import { StubCommandRunner } from '../support/stub-command-runner';

const firstProject: ProjectConfig = {
  id: 'first-project',
  name: 'first',
  path: '/first',
};
const secondProject: ProjectConfig = {
  id: 'second-project',
  name: 'second',
  path: '/second',
};

describe('RepositoryService scope', () => {
  it('publishes only its repository and rejects a foreign worktree ID', async () => {
    const store = await storeWith(firstProject, secondProject);
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'worktree') return { stdout: worktreeOutput(spec.cwd) };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const runtime = new ApplicationRuntime({ commandRunner: runner });
    const first = new RepositoryService(firstProject, '/common/first', store, runtime);
    const second = new RepositoryService(secondProject, '/common/second', store, runtime);

    const [firstSnapshot, secondSnapshot] = await Promise.all([
      first.refresh(),
      second.refresh(),
    ]);
    const foreignWorktreeId = secondSnapshot.worktrees[0]?.id;
    if (!foreignWorktreeId) throw new Error('Expected a second-repository worktree.');

    expect(firstSnapshot).toMatchObject({
      id: firstProject.id,
      worktrees: [{ projectId: firstProject.id, path: firstProject.path }],
    });
    expect(secondSnapshot).toMatchObject({ id: secondProject.id });
    await expect(first.worktreeStatus(foreignWorktreeId)).rejects.toThrow(
      'Worktree not found.',
    );
    await expect(
      first.createWorktree({
        projectId: secondProject.id,
        branch: 'feature/crafted',
        path: '/second.worktrees/crafted',
      }),
    ).rejects.toThrow('Invalid create worktree request.');
    await expect(
      first.openBranchDiff({
        projectId: secondProject.id,
        sourceBranch: 'feature/crafted',
        targetBranch: 'main',
      }),
    ).rejects.toThrow('Invalid branch comparison request.');
    expect(runner.commands).toHaveLength(2);
  });

  it('keeps refresh state and failures independent', async () => {
    const store = await storeWith(firstProject, secondProject);
    let failFirst = false;
    let secondBranch = 'main';
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] !== 'worktree') throw new Error('Unexpected command.');
      if (spec.cwd === firstProject.path && failFirst)
        throw new Error('first unavailable');
      const branch = spec.cwd === secondProject.path ? secondBranch : 'main';
      return { stdout: worktreeOutput(spec.cwd, branch) };
    });
    const runtime = new ApplicationRuntime({ commandRunner: runner });
    const first = new RepositoryService(firstProject, '/common/first', store, runtime);
    const second = new RepositoryService(secondProject, '/common/second', store, runtime);
    await Promise.all([first.refresh(), second.refresh()]);

    failFirst = true;
    secondBranch = 'feature/two';
    const [failed, refreshed] = await Promise.all([
      first.refresh({ tolerateFailure: true }),
      second.refresh(),
    ]);

    expect(failed.worktrees[0]?.branch).toBe('main');
    expect(refreshed.worktrees[0]?.branch).toBe('feature/two');
    expect(first.snapshot().worktrees[0]?.branch).toBe('main');
    expect(second.snapshot().worktrees[0]?.branch).toBe('feature/two');
  });

  it('shares the canonical mutation lock across repository consumers', async () => {
    const store = await storeWith(firstProject);
    const firstSwitchStarted = deferred<void>();
    const releaseFirstSwitch = deferred<void>();
    let branch = 'main';
    let active = 0;
    let maximumActive = 0;
    let switchCalls = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.args[0] === 'worktree')
        return { stdout: worktreeOutput(spec.cwd, branch) };
      if (spec.args[0] === 'switch') {
        switchCalls += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (switchCalls === 1) {
          firstSwitchStarted.resolve();
          await releaseFirstSwitch.promise;
        }
        branch = spec.args.at(-1) ?? branch;
        active -= 1;
        return {};
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error('Unexpected command.');
    });
    const runtime = new ApplicationRuntime({ commandRunner: runner });
    const first = new RepositoryService(firstProject, '/same/common', store, runtime);
    const second = new RepositoryService(firstProject, '/same/common', store, runtime);
    const [firstSnapshot, secondSnapshot] = await Promise.all([
      first.refresh(),
      second.refresh(),
    ]);
    const firstWorktreeId = firstSnapshot.worktrees[0]?.id;
    const secondWorktreeId = secondSnapshot.worktrees[0]?.id;
    if (!firstWorktreeId || !secondWorktreeId) throw new Error('Expected worktrees.');

    const firstSwitch = first.switchBranch({
      worktreeId: firstWorktreeId,
      branch: 'feature/one',
    });
    await firstSwitchStarted.promise;
    const secondSwitch = second.switchBranch({
      worktreeId: secondWorktreeId,
      branch: 'feature/two',
    });
    await Promise.resolve();
    expect(switchCalls).toBe(1);
    releaseFirstSwitch.resolve();
    await Promise.all([firstSwitch, secondSwitch]);

    expect(switchCalls).toBe(2);
    expect(maximumActive).toBe(1);
  });

  it('allows mutations for different canonical repositories to overlap', async () => {
    const store = await storeWith(firstProject, secondProject);
    const bothStarted = deferred<void>();
    const release = deferred<void>();
    const branches = new Map([
      [firstProject.path, 'main'],
      [secondProject.path, 'main'],
    ]);
    let active = 0;
    let maximumActive = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.args[0] === 'worktree') {
        return { stdout: worktreeOutput(spec.cwd, branches.get(spec.cwd)) };
      }
      if (spec.args[0] === 'switch') {
        branches.set(spec.cwd, spec.args.at(-1) ?? 'main');
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (active === 2) bothStarted.resolve();
        await release.promise;
        active -= 1;
        return {};
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error('Unexpected command.');
    });
    const runtime = new ApplicationRuntime({ commandRunner: runner });
    const first = new RepositoryService(firstProject, '/common/first', store, runtime);
    const second = new RepositoryService(secondProject, '/common/second', store, runtime);
    const [firstSnapshot, secondSnapshot] = await Promise.all([
      first.refresh(),
      second.refresh(),
    ]);
    const firstWorktreeId = firstSnapshot.worktrees[0]?.id;
    const secondWorktreeId = secondSnapshot.worktrees[0]?.id;
    if (!firstWorktreeId || !secondWorktreeId) throw new Error('Expected worktrees.');

    const operations = Promise.all([
      first.switchBranch({ worktreeId: firstWorktreeId, branch: 'feature/one' }),
      second.switchBranch({ worktreeId: secondWorktreeId, branch: 'feature/two' }),
    ]);
    await bothStarted.promise;
    expect(maximumActive).toBe(2);
    release.resolve();
    await operations;
  });

  it('uses one global background limit across repository services', async () => {
    const store = await storeWith(firstProject, secondProject);
    const release = deferred<void>();
    const limitReached = deferred<void>();
    let active = 0;
    let maximumActive = 0;
    let completed = 0;
    const allCompleted = deferred<void>();
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.args[0] === 'worktree') {
        return { stdout: manyWorktrees(spec.cwd, 6) };
      }
      if (spec.tool === 'github') {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (active === ApplicationRuntime.maximumConcurrentBackgroundCommands) {
          limitReached.resolve();
        }
        await release.promise;
        active -= 1;
        completed += 1;
        if (completed === 12) allCompleted.resolve();
        return { exitCode: 1 };
      }
      throw new Error('Unexpected command.');
    });
    const runtime = new ApplicationRuntime({ commandRunner: runner });
    const first = new RepositoryService(firstProject, '/common/first', store, runtime);
    const second = new RepositoryService(secondProject, '/common/second', store, runtime);

    await Promise.all([
      first.refresh({ hydratePullRequests: true }),
      second.refresh({ hydratePullRequests: true }),
    ]);
    await limitReached.promise;
    expect(maximumActive).toBe(ApplicationRuntime.maximumConcurrentBackgroundCommands);
    release.resolve();
    await allCompleted.promise;
    expect(maximumActive).toBe(ApplicationRuntime.maximumConcurrentBackgroundCommands);
  });

  it('does not leak pull-request caches, diff sessions, or preferences', async () => {
    const store = await storeWith(firstProject, secondProject);
    const headSha = '1'.repeat(40);
    const baseSha = '2'.repeat(40);
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'worktree')
        return { stdout: worktreeOutput(spec.cwd, 'feature') };
      if (spec.tool === 'github') {
        return {
          stdout: JSON.stringify({
            number: spec.cwd === firstProject.path ? 1 : 2,
            title: spec.cwd === firstProject.path ? 'First PR' : 'Second PR',
            url: `https://github.com/example/${path.basename(spec.cwd)}/pull/1`,
            state: 'OPEN',
            isDraft: false,
            baseRefName: 'main',
          }),
        };
      }
      if (spec.args[0] === 'rev-parse') return { stdout: `${headSha}\n` };
      if (spec.args[0] === 'merge-base') return { stdout: `${baseSha}\n` };
      if (spec.args[0] === 'remote') return { exitCode: 1 };
      if (spec.args.includes('--name-status')) return { stdout: 'M\0src/example.ts\0' };
      if (spec.args.includes('--numstat')) return { stdout: '1\t0\tsrc/example.ts\0' };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const runtime = new ApplicationRuntime({ commandRunner: runner });
    const first = new RepositoryService(firstProject, '/common/first', store, runtime);
    const second = new RepositoryService(secondProject, '/common/second', store, runtime);
    const [firstSnapshot, secondSnapshot] = await Promise.all([
      first.refresh(),
      second.refresh(),
    ]);
    const firstWorktreeId = firstSnapshot.worktrees[0]?.id;
    const secondWorktreeId = secondSnapshot.worktrees[0]?.id;
    if (!firstWorktreeId || !secondWorktreeId) throw new Error('Expected worktrees.');

    const [firstPullRequest, secondPullRequest] = await Promise.all([
      first.refreshPullRequest(firstWorktreeId),
      second.refreshPullRequest(secondWorktreeId),
    ]);
    expect(firstPullRequest?.title).toBe('First PR');
    expect(secondPullRequest?.title).toBe('Second PR');

    const session = await first.openBranchDiff({
      sourceBranch: 'feature',
      targetBranch: 'main',
    });
    const fileId = session.files[0]?.id;
    if (!fileId) throw new Error('Expected a diff file.');
    await expect(second.diffFile({ sessionId: session.id, fileId })).rejects.toThrow(
      'diff session expired',
    );

    await first.updateSetup('npm run first-setup');
    expect(store.repositorySetupScript(firstProject.id)).toBe('npm run first-setup');
    expect(store.repositorySetupScript(secondProject.id)).toBeUndefined();
    expect(second.snapshot()).not.toHaveProperty('setupScript');
  });

  it('disposes queued background work without publishing or leaking capacity', async () => {
    const store = await storeWith(firstProject);
    const release = deferred<void>();
    const limitReached = deferred<void>();
    let githubCalls = 0;
    let publications = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.args[0] === 'worktree') {
        return {
          stdout: manyWorktrees(
            spec.cwd,
            ApplicationRuntime.maximumConcurrentBackgroundCommands + 1,
          ),
        };
      }
      if (spec.tool === 'github') {
        githubCalls += 1;
        if (githubCalls === ApplicationRuntime.maximumConcurrentBackgroundCommands) {
          limitReached.resolve();
        }
        await release.promise;
        return {
          stdout: JSON.stringify({
            number: 1,
            title: 'Late PR',
            url: 'https://github.com/example/repo/pull/1',
            state: 'OPEN',
            isDraft: false,
            baseRefName: 'main',
          }),
        };
      }
      throw new Error('Unexpected command.');
    });
    const runtime = new ApplicationRuntime({ commandRunner: runner });
    const service = new RepositoryService(firstProject, '/common/first', store, runtime, {
      onSnapshotUpdate: () => {
        publications += 1;
      },
    });

    await service.refresh({ hydratePullRequests: true });
    await limitReached.promise;
    service.dispose();
    release.resolve();
    await runtime.runBackgroundCommand(() => Promise.resolve(undefined));

    expect(githubCalls).toBe(ApplicationRuntime.maximumConcurrentBackgroundCommands);
    expect(publications).toBe(0);
    expect(() => service.snapshot()).toThrow('repository service is disposed');
  });
});

describe('RepositoryService orchestration', () => {
  it('creates a worktree with one post-mutation refresh and recalculates display names', async () => {
    const store = await storeWith(firstProject);
    let created = false;
    const beforeCreation = `worktree /first
HEAD 1111111
branch refs/heads/main

worktree /first.worktrees/alpha/feature
HEAD 2222222
branch refs/heads/feature/alpha
`;
    const afterCreation = `${beforeCreation}
worktree /first.worktrees/beta/feature
HEAD 3333333
branch refs/heads/feature/beta
`;
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree' && spec.args[1] === 'add') {
        created = true;
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: created ? afterCreation : beforeCreation };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new RepositoryService(
      firstProject,
      '/common/first',
      store,
      new ApplicationRuntime({ commandRunner: runner }),
    );
    const initial = await service.refresh();
    expect(initial.worktrees).toMatchObject([
      { displayName: 'main' },
      { displayName: 'feature' },
    ]);
    runner.commands.splice(0);

    const result = await service.createWorktree({
      branch: 'feature/beta',
      path: '/first.worktrees/beta/feature',
    });

    expect(result.project.worktrees).toMatchObject([
      { displayName: 'main' },
      { displayName: 'alpha/feature' },
      { displayName: 'beta/feature' },
    ]);
    expect(
      runner.commands.filter(
        (command) => command.tool === 'git' && command.args[0] === 'worktree',
      ),
    ).toMatchObject([
      {
        cwd: firstProject.path,
        args: ['worktree', 'add', '/first.worktrees/beta/feature', 'feature/beta'],
      },
      { cwd: firstProject.path, args: ['worktree', 'list', '--porcelain'] },
    ]);
  });

  it('serializes approved removal with mutations and consumes the approval once', async () => {
    const store = await storeWith(firstProject);
    const addStarted = deferred<void>();
    const releaseAdd = deferred<void>();
    let created = false;
    let removed = false;
    let removeCalls = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree' && spec.args[1] === 'add') {
        addStarted.resolve();
        await releaseAdd.promise;
        created = true;
        return {};
      }
      if (
        spec.tool === 'git' &&
        spec.args[0] === 'worktree' &&
        spec.args[1] === 'remove'
      ) {
        removeCalls += 1;
        removed = true;
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return {
          stdout: worktreesFor(firstProject, [
            ...(removed ? [] : ['feature/stacked']),
            ...(created ? ['feature/new'] : []),
          ]),
        };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new RepositoryService(
      firstProject,
      '/common/first',
      store,
      new ApplicationRuntime({ commandRunner: runner }),
    );
    const initial = await service.refresh();
    const removable = initial.worktrees.find(
      (worktree) => worktree.branch === 'feature/stacked',
    );
    if (!removable) throw new Error('Expected a removable worktree.');
    const approval = service.prepareRemove(removable.id);
    const creation = service.createWorktree({
      branch: 'feature/new',
      path: '/first.worktrees/feature-new',
    });
    await addStarted.promise;

    const removal = service.approve(approval.approvalId);
    await expect(service.approve(approval.approvalId)).rejects.toThrow(
      'This approval request expired. Please start the action again.',
    );
    expect(removeCalls).toBe(0);
    releaseAdd.resolve();
    await Promise.all([creation, removal]);

    expect(removeCalls).toBe(1);
    expect(service.snapshot().worktrees.map((worktree) => worktree.branch)).toEqual([
      'main',
      'feature/new',
    ]);
  });

  it('executes an approved setup command without another topology refresh', async () => {
    const setupProject = { ...firstProject, setupScript: 'npm ci' };
    const store = await storeWith(setupProject);
    let created = false;
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree' && spec.args[1] === 'add') {
        created = true;
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return {
          stdout: worktreesFor(setupProject, created ? ['feature/new'] : []),
        };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      if (spec.tool === 'shell') return {};
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new RepositoryService(
      setupProject,
      '/common/first',
      store,
      new ApplicationRuntime({ commandRunner: runner }),
    );
    await service.refresh();
    const result = await service.createWorktree({
      branch: 'feature/new',
      path: '/first.worktrees/feature-new',
    });
    if (!result.setupApproval) throw new Error('Expected setup approval.');
    runner.commands.splice(0);

    await service.approve(result.setupApproval.approvalId);

    expect(runner.commands).toHaveLength(1);
    expect(runner.commands[0]).toMatchObject({
      tool: 'shell',
      cwd: '/first.worktrees/feature-new',
      isReadOnly: false,
    });
  });

  it('clears stale pull-request state and refreshes the switched branch', async () => {
    const store = await storeWith(firstProject);
    let switched = false;
    const initialOutput = worktreesFor(firstProject, ['feature/stacked']);
    const switchedOutput = initialOutput
      .replace('HEAD 2222222', 'HEAD 3333333')
      .replace('branch refs/heads/feature/stacked', 'branch refs/heads/release/0.1');
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: switched ? switchedOutput : initialOutput };
      }
      if (spec.tool === 'git' && spec.args[0] === 'switch') {
        switched = true;
        return {};
      }
      if (spec.tool === 'github' && spec.args[2] === 'feature/stacked') {
        return { stdout: pullRequestJson('Old branch PR') };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new RepositoryService(
      firstProject,
      '/common/first',
      store,
      new ApplicationRuntime({ commandRunner: runner }),
    );
    const initial = await service.refresh();
    const feature = initial.worktrees.find(
      (worktree) => worktree.branch === 'feature/stacked',
    );
    if (!feature) throw new Error('Expected the feature worktree.');
    await service.refreshPullRequest(feature.id);
    expect(
      service.snapshot().worktrees.find((worktree) => worktree.id === feature.id)
        ?.pullRequest?.title,
    ).toBe('Old branch PR');

    const result = await service.switchBranch({
      worktreeId: feature.id,
      branch: 'release/0.1',
    });

    const switchedWorktree = result.worktrees.find(
      (worktree) => worktree.id === feature.id,
    );
    expect(switchedWorktree).toMatchObject({
      branch: 'release/0.1',
      head: '3333333',
    });
    expect(switchedWorktree?.pullRequest).toBeUndefined();
    expect(runner.commands.find((command) => command.args[0] === 'switch')).toMatchObject(
      {
        args: ['switch', '--no-guess', '--', 'release/0.1'],
        cwd: feature.path,
        isReadOnly: false,
      },
    );
    expect(
      runner.commands.some(
        (command) => command.tool === 'github' && command.args[2] === 'release/0.1',
      ),
    ).toBe(true);
  });

  it('persists and reuses a comparison override when opening a diff', async () => {
    const store = await storeWith(firstProject);
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'worktree') {
        return { stdout: worktreesFor(firstProject, ['feature/stacked']) };
      }
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new RepositoryService(
      firstProject,
      '/common/first',
      store,
      new ApplicationRuntime({ commandRunner: runner }),
    );
    const snapshot = await service.refresh();
    const feature = snapshot.worktrees.find(
      (worktree) => worktree.branch === 'feature/stacked',
    );
    if (!feature) throw new Error('Expected the feature worktree.');
    vi.spyOn(service.git, 'listBranches').mockResolvedValue([
      'feature/stacked',
      'main',
      'release/next',
    ]);
    const comparison = vi.spyOn(service.git, 'comparison').mockResolvedValue({
      automaticBaseBranch: 'main',
      targetBranch: 'release/next',
      comparisonBaseOverride: 'release/next',
      diffStats: { files: 2, additions: 8, deletions: 3 },
    });
    const session = diffSession(feature.id, feature.branch, 'release/next');
    const openDiff = vi.spyOn(service.git, 'openDiff').mockResolvedValue(session);

    await service.setComparisonBase({
      worktreeId: feature.id,
      targetBranch: 'release/next',
    });
    expect(
      store.state.repositoryPreferences[firstProject.id]?.comparisonBaseOverrides[
        feature.id
      ],
    ).toEqual({ sourceBranch: 'feature/stacked', targetBranch: 'release/next' });
    expect(comparison).toHaveBeenCalledWith(firstProject, feature, 'release/next');

    await expect(service.openDiff(feature.id)).resolves.toEqual(session);
    expect(openDiff).toHaveBeenCalledWith(firstProject, feature, 'release/next');
  });

  it('binds branch-diff editor access to a worktree on the source branch', async () => {
    const store = await storeWith(firstProject);
    const runner = new StubCommandRunner((spec) => {
      if (spec.args[0] === 'worktree') {
        return { stdout: worktreesFor(firstProject, ['feature/stacked']) };
      }
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new RepositoryService(
      firstProject,
      '/common/first',
      store,
      new ApplicationRuntime({ commandRunner: runner }),
    );
    const snapshot = await service.refresh();
    const sourceWorktree = snapshot.worktrees.find(
      (worktree) => worktree.branch === 'feature/stacked',
    );
    if (!sourceWorktree) throw new Error('Expected the feature worktree.');
    const session = diffSession(sourceWorktree.id, sourceWorktree.branch, 'main');
    const openBranchDiff = vi
      .spyOn(service.git, 'openBranchDiff')
      .mockResolvedValue(session);

    await expect(
      service.openBranchDiff({
        sourceBranch: 'feature/stacked',
        targetBranch: 'main',
      }),
    ).resolves.toEqual(session);
    expect(openBranchDiff).toHaveBeenCalledWith(
      firstProject,
      'feature/stacked',
      'main',
      sourceWorktree,
    );
  });

  it('releases the repository mutation lock after command failure', async () => {
    const store = await storeWith(firstProject);
    const createdBranches: string[] = [];
    let addCalls = 0;
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree' && spec.args[1] === 'add') {
        addCalls += 1;
        if (addCalls === 1) return { exitCode: 1, stderr: 'creation failed' };
        createdBranches.push(spec.args[3] ?? 'unknown');
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: worktreesFor(firstProject, createdBranches) };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new RepositoryService(
      firstProject,
      '/common/first',
      store,
      new ApplicationRuntime({ commandRunner: runner }),
    );
    await service.refresh();

    const failed = service.createWorktree({
      branch: 'feature/failed',
      path: '/first.worktrees/failed',
    });
    const succeeded = service.createWorktree({
      branch: 'feature/saved',
      path: '/first.worktrees/feature-saved',
    });

    await expect(failed).rejects.toThrow('creation failed');
    await expect(succeeded).resolves.toBeDefined();
    expect(addCalls).toBe(2);
    expect(
      service
        .snapshot()
        .worktrees.some((worktree) => worktree.branch === 'feature/saved'),
    ).toBe(true);
  });
});

async function storeWith(...projects: ProjectConfig[]): Promise<StateStore> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-repository-service-'));
  const store = new StateStore(directory);
  await store.load();
  for (const project of projects) await store.addRepository(project);
  return store;
}

function worktreeOutput(repositoryPath: string, branch = 'main'): string {
  return `worktree ${repositoryPath}\nHEAD 1111111\nbranch refs/heads/${branch}\n`;
}

function manyWorktrees(repositoryPath: string, count: number): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `worktree ${repositoryPath}.worktrees/branch-${index}\nHEAD ${String(index).padStart(7, '0')}\nbranch refs/heads/branch-${index}`,
  ).join('\n\n');
}

function worktreesFor(project: ProjectConfig, branches: readonly string[]): string {
  return [
    `worktree ${project.path}\nHEAD 1111111\nbranch refs/heads/main`,
    ...branches.map(
      (branch, index) =>
        `worktree ${project.path}.worktrees/${branch.replaceAll('/', '-')}\nHEAD ${String(index + 2).repeat(7)}\nbranch refs/heads/${branch}`,
    ),
  ].join('\n\n');
}

function pullRequestJson(title: string): string {
  return JSON.stringify({
    number: 42,
    title,
    url: 'https://github.com/example/repo/pull/42',
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'main',
  });
}

function diffSession(
  sourceWorktreeId: string,
  branch: string,
  targetBranch: string,
): DiffSession {
  return {
    kind: 'branch',
    id: 'session',
    projectId: firstProject.id,
    sourceWorktreeId,
    branch,
    targetBranch,
    baseSha: 'base',
    headSha: 'head',
    stats: { files: 0, additions: 0, deletions: 0 },
    files: [],
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
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
