import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Project } from '../../../src/shared/contracts';
import { AppService } from '../../../src/main/services/app-service';
import { StateStore } from '../../../src/main/store';
import { StubCommandRunner } from '../support/stub-command-runner';

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
      if (spec.tool === 'git' && spec.args[0] === 'log') {
        return {
          stdout:
            'bbbbbbb\u0000Ada Lovelace\u0000ada@example.com\u00002026-07-19T14:25:00+02:00\u0000Cached details commit\u0000\n',
        };
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
      systemLocale: 'en-PL',
      onSnapshotUpdate: (snapshot) => {
        if (snapshot.projects[0]?.worktrees[1]?.pullRequest?.title === 'Cached title') {
          resolveHydratedSnapshot?.(snapshot);
        }
      },
    });

    const initial = await service.refresh();
    expect(initial.systemLocale).toBe('en-PL');
    const worktree = initial.projects[0]?.worktrees[1];
    expect(worktree).toBeDefined();
    if (!worktree) throw new Error('Expected the feature worktree.');
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
    expect(cachedDetails.commit?.title).toBe('Cached details commit');
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

describe('AppService project refresh', () => {
  it('refreshes only the requested project and preserves other project trees', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const otherProject: Project = {
      id: 'other-project',
      name: 'other-repo',
      path: '/other-repo',
    };
    await store.update((state) => state.projects.push(project, otherProject));

    let projectRefreshes = 0;
    let otherProjectRefreshes = 0;
    let pullRequestLookups = 0;
    let includeFeature = false;
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        if (spec.cwd === project.path) {
          projectRefreshes += 1;
          return {
            stdout: includeFeature
              ? worktreeOutput
              : `worktree /repo
HEAD 1111111
branch refs/heads/main
`,
          };
        }
        if (spec.cwd === otherProject.path) {
          otherProjectRefreshes += 1;
          return {
            stdout: `worktree /other-repo
HEAD 3333333
branch refs/heads/main
`,
          };
        }
      }
      if (spec.tool === 'github') {
        pullRequestLookups += 1;
        return { exitCode: 1 };
      }
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);

    const initial = await service.refresh();
    expect(initial.projects[0]?.worktrees).toHaveLength(1);
    expect(initial.projects[1]?.worktrees).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const initialPullRequestLookups = pullRequestLookups;

    includeFeature = true;
    const refreshed = await service.refreshProject(project.id);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(refreshed.projects[0]?.worktrees).toHaveLength(2);
    expect(refreshed.projects[1]?.worktrees).toEqual(initial.projects[1]?.worktrees);
    expect(projectRefreshes).toBe(2);
    expect(otherProjectRefreshes).toBe(1);
    expect(pullRequestLookups).toBe(initialPullRequestLookups);
  });

  it('rejects a refresh for an unknown project', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const service = new AppService(
      store,
      new StubCommandRunner(() => {
        throw new Error('No command expected.');
      }),
    );

    await expect(service.refreshProject('missing')).rejects.toThrow('Project not found.');
  });

  it('preserves the existing project tree when an automatic refresh fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));

    let failRefresh = false;
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        if (failRefresh) throw new Error('Repository is temporarily unavailable.');
        return { stdout: worktreeOutput };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const initial = await service.refresh();

    failRefresh = true;
    await expect(service.refreshProject(project.id)).rejects.toThrow(
      'Repository is temporarily unavailable.',
    );
    expect(service.snapshot().projects[0]?.worktrees).toEqual(
      initial.projects[0]?.worktrees,
    );
  });

  it('does not restore a project removed during an in-flight refresh', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));

    let worktreeCalls = 0;
    let resolveRefresh: ((result: { stdout: string }) => void) | undefined;
    let resolveRefreshStarted: (() => void) | undefined;
    const refreshStarted = new Promise<void>((resolve) => {
      resolveRefreshStarted = resolve;
    });
    const delayedRefresh = new Promise<{ stdout: string }>((resolve) => {
      resolveRefresh = resolve;
    });
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        worktreeCalls += 1;
        if (worktreeCalls === 1) return { stdout: worktreeOutput };
        resolveRefreshStarted?.();
        return delayedRefresh;
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    await service.refresh();

    const refresh = service.refreshProject(project.id);
    await refreshStarted;
    await service.removeProject(project.id);
    if (!resolveRefresh) throw new Error('Expected the project refresh to be pending.');
    resolveRefresh({ stdout: worktreeOutput });

    await expect(refresh).resolves.toMatchObject({ projects: [] });
    expect(service.snapshot().projects).toEqual([]);
  });
});

describe('AppService branch switching', () => {
  it('clears old PR data and starts refreshing the new branch immediately', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    let switched = false;
    const switchedWorktreeOutput = `worktree /repo
HEAD 1111111
branch refs/heads/main

worktree /repo.worktrees/feature
HEAD 3333333
branch refs/heads/release/0.1
`;
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: switched ? switchedWorktreeOutput : worktreeOutput };
      }
      if (spec.tool === 'git' && spec.args[0] === 'switch') {
        switched = true;
        return {};
      }
      if (spec.tool === 'github' && spec.args[2] === 'feature/stacked') {
        return { stdout: pullRequestJson('Old branch PR', 'OPEN', false) };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const initial = await service.refresh();
    const feature = initial.projects[0]?.worktrees[1];
    if (!feature) throw new Error('Expected the feature worktree.');
    await service.refreshPullRequest(feature.id);
    expect(service.snapshot().projects[0]?.worktrees[1]?.pullRequest?.title).toBe(
      'Old branch PR',
    );

    const result = await service.switchBranch({
      worktreeId: feature.id,
      branch: 'release/0.1',
    });

    expect(result.projects[0]?.worktrees[1]).toMatchObject({
      id: feature.id,
      branch: 'release/0.1',
      head: '3333333',
    });
    expect(result.projects[0]?.worktrees[1]?.pullRequest).toBeUndefined();
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
});
