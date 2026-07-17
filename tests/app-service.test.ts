import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Project } from '../src/shared/contracts';
import { AppService } from '../src/main/app-service';
import { StateStore } from '../src/main/store';
import { StubCommandRunner } from './stub-command-runner';

const project: Project = {
  id: 'project',
  name: 'repo',
  path: '/repo',
};

const worktreeOutput = `worktree /repo
HEAD 1111111
branch refs/heads/main

worktree /repo.worktrees/feature
HEAD 2222222
branch refs/heads/feature/stacked
`;

function pullRequestJson(
  title: string,
  state: 'OPEN' | 'MERGED',
  isDraft: boolean,
): string {
  return JSON.stringify({
    number: 42,
    title,
    url: 'https://github.com/example/repo/pull/42',
    state,
    isDraft,
    baseRefName: 'feature/base',
  });
}

describe('AppService pull request refresh', () => {
  it('returns local worktrees before hydration, publishes PRs, and reuses recent lookups', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));

    let now = 0;
    let featurePullRequestCalls = 0;
    let resolveInitialLookup: ((result: { stdout: string }) => void) | undefined;
    let resolveLookupStarted: (() => void) | undefined;
    const lookupStarted = new Promise<void>((resolve) => {
      resolveLookupStarted = resolve;
    });
    const initialLookup = new Promise<{ stdout: string }>((resolve) => {
      resolveInitialLookup = resolve;
    });
    let resolveHydratedSnapshot:
      ((snapshot: ReturnType<AppService['snapshot']>) => void) | undefined;
    const hydratedSnapshot = new Promise<ReturnType<AppService['snapshot']>>(
      (resolve) => {
        resolveHydratedSnapshot = resolve;
      },
    );
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: worktreeOutput };
      }
      if (spec.tool === 'git' && spec.args[0] === 'symbolic-ref') {
        return { stdout: 'origin/main\n' };
      }
      if (spec.tool === 'git' && spec.args[0] === 'diff') {
        return { stdout: '3\t1\tsrc/example.ts\n' };
      }
      if (spec.tool === 'github' && spec.args[2] === 'main') {
        return { exitCode: 1, stderr: 'no pull request found' };
      }
      if (spec.tool === 'github' && spec.args[2] === 'feature/stacked') {
        featurePullRequestCalls += 1;
        if (featurePullRequestCalls === 1) {
          resolveLookupStarted?.();
          return initialLookup;
        }
        if (featurePullRequestCalls === 2) {
          return { stdout: pullRequestJson('Fresh title', 'OPEN', false) };
        }
        return { exitCode: 1, stderr: 'network unavailable' };
      }
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner, {
      now: () => now,
      onSnapshotUpdate: (snapshot) => {
        if (snapshot.projects[0]?.worktrees[1]?.pullRequest?.title === 'Cached title') {
          resolveHydratedSnapshot?.(snapshot);
        }
      },
    });

    const initial = await service.refresh();
    const worktree = initial.projects[0]?.worktrees[1];
    expect(worktree).toBeDefined();
    if (!worktree) throw new Error('Expected the feature worktree.');
    expect(initial.projects[0]?.defaultBranch).toBe('main');
    expect(worktree.pullRequest).toBeUndefined();
    await lookupStarted;
    expect(featurePullRequestCalls).toBe(1);

    if (!resolveInitialLookup) throw new Error('Expected the PR lookup to start.');
    resolveInitialLookup({
      stdout: pullRequestJson('Cached title', 'OPEN', true),
    });
    const hydrated = await hydratedSnapshot;
    expect(hydrated.projects[0]?.worktrees[1]?.pullRequest).toEqual({
      number: 42,
      title: 'Cached title',
      url: 'https://github.com/example/repo/pull/42',
      state: 'DRAFT',
      baseBranch: 'feature/base',
    });
    expect(
      runner.commands.find(
        (command) => command.tool === 'github' && command.args[2] === 'feature/stacked',
      )?.args,
    ).toEqual([
      'pr',
      'view',
      'feature/stacked',
      '--json',
      'number,title,url,state,isDraft,baseRefName',
    ]);

    const cachedDetails = await service.details(worktree.id);
    expect(cachedDetails.pullRequest?.title).toBe('Cached title');
    expect(cachedDetails.targetBranch).toBe('feature/base');
    expect(featurePullRequestCalls).toBe(1);

    await expect(service.refreshPullRequest(worktree.id)).resolves.toMatchObject({
      title: 'Cached title',
      state: 'DRAFT',
    });
    expect(featurePullRequestCalls).toBe(1);

    now = 31_000;
    await expect(service.refreshPullRequest(worktree.id)).resolves.toMatchObject({
      title: 'Fresh title',
      state: 'OPEN',
    });
    expect(service.snapshot().projects[0]?.worktrees[1]?.pullRequest).toMatchObject({
      title: 'Fresh title',
      state: 'OPEN',
    });

    now = 62_000;
    await expect(service.refreshPullRequest(worktree.id)).resolves.toMatchObject({
      title: 'Fresh title',
      state: 'OPEN',
    });
    expect(service.snapshot().projects[0]?.worktrees[1]?.pullRequest?.title).toBe(
      'Fresh title',
    );
  });

  it('limits background GitHub hydration to five concurrent lookups', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    const manyWorktrees = Array.from(
      { length: 12 },
      (_, index) => `worktree /repo.worktrees/branch-${index}
HEAD ${String(index).padStart(7, '0')}
branch refs/heads/branch-${index}`,
    ).join('\n\n');
    let active = 0;
    let completed = 0;
    let maximumActive = 0;
    let resolveHydration: (() => void) | undefined;
    const hydrationFinished = new Promise<void>((resolve) => {
      resolveHydration = resolve;
    });
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: manyWorktrees };
      }
      if (spec.tool === 'git' && spec.args[0] === 'symbolic-ref') {
        return { stdout: 'origin/main\n' };
      }
      if (spec.tool === 'github') {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        completed += 1;
        if (completed === 12) resolveHydration?.();
        return { exitCode: 1 };
      }
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });

    const initial = await new AppService(store, runner).refresh();
    expect(initial.projects[0]?.worktrees).toHaveLength(12);
    await hydrationFinished;

    expect(maximumActive).toBe(5);
  });
});
