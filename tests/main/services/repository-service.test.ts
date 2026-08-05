import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApplicationRuntime } from '../../../src/main/application-runtime';
import { RepositoryService } from '../../../src/main/services/repository-service';
import { StateStore } from '../../../src/main/store';
import type { ProjectConfig } from '../../../src/shared/contracts';
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

async function storeWith(...projects: ProjectConfig[]): Promise<StateStore> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-repository-service-'));
  const store = new StateStore(directory);
  await store.load();
  await store.update((state) => state.projects.push(...projects));
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
