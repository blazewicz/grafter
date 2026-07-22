import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DiffSession, Project } from '../../../src/shared/contracts';
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
  it('reports unexpected background hydration errors without an unhandled rejection', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    let reportError: ((value: { message: string; error: unknown }) => void) | undefined;
    const reportedError = new Promise<{ message: string; error: unknown }>((resolve) => {
      reportError = resolve;
    });
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: worktreeOutput };
      }
      if (spec.tool === 'github') {
        return { stdout: pullRequestJson('Background PR', 'OPEN', false) };
      }
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const snapshotFailure = new Error('Snapshot subscriber failed');
    const service = new AppService(store, runner, {
      onSnapshotUpdate: () => {
        throw snapshotFailure;
      },
      onBackgroundError: (message, error) => reportError?.({ message, error }),
    });

    const initial = await service.refresh();
    expect(initial.projects[0]?.worktrees).toHaveLength(2);
    await expect(reportedError).resolves.toEqual({
      message: 'Background pull-request hydration failed.',
      error: snapshotFailure,
    });
  });

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
            'bbbbbbb\nAda Lovelace\nada@example.com\n2026-07-19T14:25:00+02:00\nCached details commit\n\u0000\n3\t1\tsrc/example.ts\n',
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

  it('limits concurrent background GitHub hydration', async () => {
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

    expect(maximumActive).toBe(AppService.maximumConcurrentBackgroundPullRequestLookups);
  });

  it('reserves room for interactive work and shares a queued lookup', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    const worktrees = Array.from(
      { length: 6 },
      (_, index) => `worktree /repo.worktrees/branch-${index}
HEAD ${String(index).padStart(7, '0')}
branch refs/heads/branch-${index}`,
    ).join('\n\n');
    let active = 0;
    let starts = 0;
    let completed = 0;
    let resolveBackgroundFull: (() => void) | undefined;
    let resolveInteractiveStarted: (() => void) | undefined;
    let releaseLookups: (() => void) | undefined;
    let resolveAllCompleted: (() => void) | undefined;
    const backgroundFull = new Promise<void>((resolve) => {
      resolveBackgroundFull = resolve;
    });
    const interactiveStarted = new Promise<void>((resolve) => {
      resolveInteractiveStarted = resolve;
    });
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });
    const allCompleted = new Promise<void>((resolve) => {
      resolveAllCompleted = resolve;
    });
    const startsByBranch = new Map<string, number>();
    const backgroundLimit = AppService.maximumConcurrentBackgroundPullRequestLookups;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: worktrees };
      }
      if (spec.tool === 'git' && spec.args[0] === 'status') {
        resolveInteractiveStarted?.();
        return { stdout: '' };
      }
      const branch = spec.args[2] ?? '';
      starts += 1;
      active += 1;
      startsByBranch.set(branch, (startsByBranch.get(branch) ?? 0) + 1);
      if (active === backgroundLimit) resolveBackgroundFull?.();
      await lookupGate;
      active -= 1;
      completed += 1;
      if (completed === 6) resolveAllCompleted?.();
      return { exitCode: 1 };
    });
    const service = new AppService(store, runner);
    const snapshot = await service.refresh();

    await backgroundFull;
    const queuedWorktree = snapshot.projects[0]?.worktrees[4];
    const interactiveWorktree = snapshot.projects[0]?.worktrees[0];
    if (!queuedWorktree || !interactiveWorktree) {
      throw new Error('Expected queued and interactive worktrees.');
    }
    const duplicateQueued = service.refreshPullRequest(queuedWorktree.id);
    const interactive = service.worktreeStatus(interactiveWorktree.id);
    await interactiveStarted;

    await expect(interactive).resolves.toBe('clean');
    expect(active).toBe(backgroundLimit);
    expect(starts).toBe(backgroundLimit);
    expect(startsByBranch.get(queuedWorktree.branch)).toBeUndefined();
    releaseLookups?.();
    await Promise.all([duplicateQueued, allCompleted]);
    expect(startsByBranch.get(queuedWorktree.branch)).toBe(1);
    expect(starts).toBe(6);
  });

  it('uses one background limit across overlapping disjoint hydration batches', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    const output = (offset: number) =>
      Array.from(
        { length: 6 },
        (_, index) => `worktree /repo.worktrees/branch-${offset + index}
HEAD ${String(offset + index).padStart(7, '0')}
branch refs/heads/branch-${offset + index}`,
      ).join('\n\n');
    let refreshes = 0;
    let active = 0;
    let maximumActive = 0;
    let completed = 0;
    let resolveFirstWave: (() => void) | undefined;
    let releaseLookups: (() => void) | undefined;
    let resolveAllCompleted: (() => void) | undefined;
    const firstWave = new Promise<void>((resolve) => {
      resolveFirstWave = resolve;
    });
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });
    const allCompleted = new Promise<void>((resolve) => {
      resolveAllCompleted = resolve;
    });
    const backgroundLimit = AppService.maximumConcurrentBackgroundPullRequestLookups;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git') {
        const current = refreshes;
        refreshes += 1;
        return { stdout: output(current === 0 ? 0 : 6) };
      }
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (active === backgroundLimit) resolveFirstWave?.();
      await lookupGate;
      active -= 1;
      completed += 1;
      if (completed === 12) resolveAllCompleted?.();
      return { exitCode: 1 };
    });
    const service = new AppService(store, runner);

    await service.refresh();
    await firstWave;
    await service.refresh();
    expect(maximumActive).toBe(backgroundLimit);

    releaseLookups?.();
    await allCompleted;
    expect(maximumActive).toBe(backgroundLimit);
  });
});

describe('AppService project refresh', () => {
  it('bounds concurrent project refreshes and preserves project order', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const projects = Array.from({ length: 7 }, (_, index): Project => ({
      id: `project-${index}`,
      name: `repo-${index}`,
      path: `/repo-${index}`,
    }));
    await store.update((state) => state.projects.push(...projects));
    const releaseRefreshes = deferred<void>();
    const limitReached = deferred<void>();
    let active = 0;
    let maximumActive = 0;
    let started = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        active += 1;
        started += 1;
        maximumActive = Math.max(maximumActive, active);
        if (started === AppService.maximumConcurrentProjectRefreshes) {
          limitReached.resolve();
        }
        await releaseRefreshes.promise;
        active -= 1;
        return {
          stdout: `worktree ${spec.cwd}\nHEAD 1111111\nbranch refs/heads/main\n`,
        };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const refresh = service.refresh();

    await limitReached.promise;
    expect(started).toBe(AppService.maximumConcurrentProjectRefreshes);
    expect(maximumActive).toBe(AppService.maximumConcurrentProjectRefreshes);
    releaseRefreshes.resolve();

    const snapshot = await refresh;
    expect(maximumActive).toBe(AppService.maximumConcurrentProjectRefreshes);
    expect(snapshot.projects.map((item) => item.id)).toEqual(
      projects.map((item) => item.id),
    );
  });

  it('preserves project order when refreshes finish out of order', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const projects = Array.from({ length: 3 }, (_, index): Project => ({
      id: `ordered-${index}`,
      name: `ordered-${index}`,
      path: `/ordered-${index}`,
    }));
    await store.update((state) => state.projects.push(...projects));
    const results = new Map(
      projects.map((item) => [item.path, deferred<{ stdout: string }>()]),
    );
    const allStarted = deferred<void>();
    let started = 0;
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        started += 1;
        if (started === projects.length) allStarted.resolve();
        const result = results.get(spec.cwd);
        if (!result) throw new Error(`Unexpected project: ${spec.cwd}`);
        return result.promise;
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const refresh = service.refresh();

    await allStarted.promise;
    for (const item of [...projects].reverse()) {
      results.get(item.path)?.resolve({
        stdout: `worktree ${item.path}\nHEAD 1111111\nbranch refs/heads/main\n`,
      });
      await Promise.resolve();
    }

    const snapshot = await refresh;
    expect(snapshot.projects.map((item) => item.id)).toEqual(
      projects.map((item) => item.id),
    );
    expect(snapshot.projects.map((item) => item.worktrees[0]?.projectId)).toEqual(
      projects.map((item) => item.id),
    );
  });

  it('keeps successful project results when another automatic refresh fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const unavailable: Project = {
      id: 'unavailable',
      name: 'unavailable',
      path: '/unavailable',
    };
    const available: Project = {
      id: 'available',
      name: 'available',
      path: '/available',
    };
    await store.update((state) => state.projects.push(unavailable, available));
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        if (spec.cwd === unavailable.path) {
          throw new Error('Repository is temporarily unavailable.');
        }
        return {
          stdout: `worktree ${available.path}\nHEAD 2222222\nbranch refs/heads/main\n`,
        };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });

    const snapshot = await new AppService(store, runner).refresh();

    expect(snapshot.projects).toMatchObject([
      { id: unavailable.id, worktrees: [] },
      { id: available.id, worktrees: [{ path: available.path }] },
    ]);
  });

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

describe('AppService targeted project updates', () => {
  it('adds and removes projects without scanning unrelated repositories', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const existing: Project = {
      id: 'existing',
      name: 'existing',
      path: '/existing',
    };
    await store.update((state) => state.projects.push(existing));
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return {
          stdout: `worktree ${spec.cwd}\nHEAD 1111111\nbranch refs/heads/main\n`,
        };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    await service.refresh();
    runner.commands.splice(0);
    vi.spyOn(service.git, 'inspectMainClone').mockResolvedValue({
      name: 'added',
      path: '/added',
    });

    const added = await service.addProject('/added');

    expect(added.projects.map((item) => item.path)).toEqual(['/existing', '/added']);
    expect(
      runner.commands.filter(
        (command) => command.tool === 'git' && command.args[0] === 'worktree',
      ),
    ).toMatchObject([{ cwd: '/added' }]);

    runner.commands.splice(0);
    const removed = await service.removeProject(existing.id);
    expect(removed.projects.map((item) => item.path)).toEqual(['/added']);
    expect(runner.commands).toHaveLength(0);
    expect(removed.projects[0]?.worktrees).toHaveLength(1);
  });

  it('creates a worktree with one targeted post-mutation scan', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const otherProject: Project = {
      id: 'other-project',
      name: 'other-repo',
      path: '/other-repo',
    };
    await store.update((state) => state.projects.push(project, otherProject));
    let created = false;
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree' && spec.args[1] === 'add') {
        created = true;
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        const currentProject = spec.cwd === project.path ? project : otherProject;
        return {
          stdout: worktreesFor(
            currentProject,
            created && currentProject.id === project.id ? ['feature/new'] : [],
          ),
        };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    await service.refresh();
    runner.commands.splice(0);

    await service.createWorktree({
      projectId: project.id,
      branch: 'feature/new',
      path: '/repo.worktrees/feature-new',
    });

    const topologyCommands = runner.commands.filter(
      (command) => command.tool === 'git' && command.args[0] === 'worktree',
    );
    expect(topologyCommands).toHaveLength(2);
    expect(topologyCommands.map((command) => command.args[1])).toEqual(['add', 'list']);
    expect(topologyCommands.every((command) => command.cwd === project.path)).toBe(true);
  });

  it('updates setup metadata without scanning worktrees', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: worktreeOutput };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    await service.refresh();
    runner.commands.splice(0);

    const snapshot = await service.updateProjectSetup(project.id, '  npm ci  ');

    expect(snapshot.projects[0]).toMatchObject({
      setupScript: 'npm ci',
      worktrees: [{ branch: 'main' }, { branch: 'feature/stacked' }],
    });
    expect(runner.commands).toHaveLength(0);
  });

  it('refreshes an approved removal exactly once and does not rescan other projects', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const otherProject: Project = {
      id: 'other-project',
      name: 'other-repo',
      path: '/other-repo',
    };
    await store.update((state) => state.projects.push(project, otherProject));
    let removed = false;
    const runner = new StubCommandRunner((spec) => {
      if (
        spec.tool === 'git' &&
        spec.args[0] === 'worktree' &&
        spec.args[1] === 'remove'
      ) {
        removed = true;
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        const currentProject = spec.cwd === project.path ? project : otherProject;
        return {
          stdout: worktreesFor(
            currentProject,
            !removed && currentProject.id === project.id ? ['feature/stacked'] : [],
          ),
        };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const initial = await service.refresh();
    const removable = initial.projects[0]?.worktrees[1];
    if (!removable) throw new Error('Expected a removable worktree.');
    const approval = service.prepareRemove(removable.id);
    runner.commands.splice(0);

    const snapshot = await service.approve(approval.approvalId);

    expect(snapshot.projects[0]?.worktrees).toHaveLength(1);
    expect(
      runner.commands.filter(
        (command) => command.tool === 'git' && command.args[0] === 'worktree',
      ),
    ).toMatchObject([
      { cwd: project.path, args: ['worktree', 'remove', removable.path] },
      { cwd: project.path, args: ['worktree', 'list', '--porcelain'] },
    ]);
  });

  it('runs an approved setup script without a topology refresh', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const setupProject: Project = { ...project, setupScript: 'npm ci' };
    await store.update((state) => state.projects.push(setupProject));
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
    const service = new AppService(store, runner);
    await service.refresh();
    const result = await service.createWorktree({
      projectId: setupProject.id,
      branch: 'feature/new',
      path: '/repo.worktrees/feature-new',
    });
    if (!result.setupApproval) throw new Error('Expected setup approval.');
    runner.commands.splice(0);

    await service.approve(result.setupApproval.approvalId);

    expect(runner.commands).toHaveLength(1);
    expect(runner.commands[0]).toMatchObject({ tool: 'shell', isReadOnly: false });
  });
});

describe('AppService worktree creation', () => {
  it('recalculates all display names after adding a colliding worktree', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    let created = false;
    const beforeCreation = `worktree /repo
HEAD 1111111
branch refs/heads/main

worktree /repo.worktrees/alpha/feature
HEAD 2222222
branch refs/heads/feature/alpha
`;
    const afterCreation = `${beforeCreation}

worktree /repo.worktrees/beta/feature
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
    const service = new AppService(store, runner);

    const initial = await service.refresh();
    expect(initial.projects[0]?.worktrees).toMatchObject([
      { displayName: 'main' },
      { displayName: 'feature' },
    ]);

    const result = await service.createWorktree({
      projectId: project.id,
      branch: 'feature/beta',
      path: '/repo.worktrees/beta/feature',
    });

    expect(result.snapshot.projects[0]?.worktrees).toMatchObject([
      { displayName: 'main' },
      { displayName: 'alpha/feature' },
      { displayName: 'beta/feature' },
    ]);
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

describe('AppService repository operation serialization', () => {
  it('does not overlap same-project mutations and holds the lock through refresh', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    const releaseFirstAdd = deferred<void>();
    const firstRefreshStarted = deferred<void>();
    const releaseFirstRefresh = deferred<void>();
    const secondAddStarted = deferred<void>();
    const createdBranches: string[] = [];
    let addCalls = 0;
    let worktreeListCalls = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree' && spec.args[1] === 'add') {
        addCalls += 1;
        if (addCalls === 1) await releaseFirstAdd.promise;
        else secondAddStarted.resolve();
        createdBranches.push(spec.args[3] ?? 'unknown');
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        worktreeListCalls += 1;
        if (worktreeListCalls === 2) {
          firstRefreshStarted.resolve();
          await releaseFirstRefresh.promise;
        }
        return { stdout: worktreesFor(project, createdBranches) };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    await service.refresh();

    const first = service.createWorktree({
      projectId: project.id,
      branch: 'feature/one',
      path: '/repo.worktrees/feature-one',
    });
    const second = service.createWorktree({
      projectId: project.id,
      branch: 'feature/two',
      path: '/repo.worktrees/feature-two',
    });

    await Promise.resolve();
    expect(addCalls).toBe(1);
    releaseFirstAdd.resolve();
    await firstRefreshStarted.promise;
    expect(addCalls).toBe(1);
    releaseFirstRefresh.resolve();
    await secondAddStarted.promise;
    await Promise.all([first, second]);
    expect(addCalls).toBe(2);
  });

  it('allows mutations for different projects to overlap', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const otherProject: Project = {
      id: 'other-project',
      name: 'other-repo',
      path: '/other-repo',
    };
    await store.update((state) => state.projects.push(project, otherProject));
    const bothAddsStarted = deferred<void>();
    const releaseAdds = deferred<void>();
    const startedProjects = new Set<string>();
    const createdByProject = new Map<string, string[]>();
    let activeAdds = 0;
    let maximumActiveAdds = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree' && spec.args[1] === 'add') {
        activeAdds += 1;
        maximumActiveAdds = Math.max(maximumActiveAdds, activeAdds);
        startedProjects.add(spec.cwd);
        if (startedProjects.size === 2) bothAddsStarted.resolve();
        await releaseAdds.promise;
        const branches = createdByProject.get(spec.cwd) ?? [];
        branches.push(spec.args[3] ?? 'unknown');
        createdByProject.set(spec.cwd, branches);
        activeAdds -= 1;
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        const currentProject = spec.cwd === project.path ? project : otherProject;
        return {
          stdout: worktreesFor(
            currentProject,
            createdByProject.get(currentProject.path) ?? [],
          ),
        };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    await service.refresh();

    const first = service.createWorktree({
      projectId: project.id,
      branch: 'feature/one',
      path: '/repo.worktrees/feature-one',
    });
    const second = service.createWorktree({
      projectId: otherProject.id,
      branch: 'feature/two',
      path: '/other-repo.worktrees/feature-two',
    });

    await bothAddsStarted.promise;
    expect(maximumActiveAdds).toBe(2);
    releaseAdds.resolve();
    await Promise.all([first, second]);
  });

  it('releases the project lock after a command failure', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
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
        return { stdout: worktreesFor(project, createdBranches) };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    await service.refresh();

    const failed = service.createWorktree({
      projectId: project.id,
      branch: 'feature/failed',
      path: '/repo.worktrees/failed',
    });
    const succeeded = service.createWorktree({
      projectId: project.id,
      branch: 'feature/saved',
      path: '/repo.worktrees/feature-saved',
    });

    await expect(failed).rejects.toThrow('creation failed');
    await expect(succeeded).resolves.toBeDefined();
    expect(addCalls).toBe(2);
  });

  it('serializes approved removal with mutations and consumes approval once', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
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
        const branches = [
          ...(removed ? [] : ['feature/stacked']),
          ...(created ? ['feature/new'] : []),
        ];
        return { stdout: worktreesFor(project, branches) };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const initial = await service.refresh();
    const removable = initial.projects[0]?.worktrees.find(
      (worktree) => worktree.branch === 'feature/stacked',
    );
    if (!removable) throw new Error('Expected a removable worktree.');
    const approval = service.prepareRemove(removable.id);
    const creation = service.createWorktree({
      projectId: project.id,
      branch: 'feature/new',
      path: '/repo.worktrees/feature-new',
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
  });

  it('makes a topology refresh wait for the active same-project mutation', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    const switchStarted = deferred<void>();
    const releaseSwitch = deferred<void>();
    let switched = false;
    let worktreeListCalls = 0;
    const switchedOutput = worktreeOutput.replace(
      'branch refs/heads/feature/stacked',
      'branch refs/heads/release/0.1',
    );
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'switch') {
        switched = true;
        switchStarted.resolve();
        await releaseSwitch.promise;
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        worktreeListCalls += 1;
        return { stdout: switched ? switchedOutput : worktreeOutput };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const initial = await service.refresh();
    const feature = initial.projects[0]?.worktrees[1];
    if (!feature) throw new Error('Expected the feature worktree.');

    const switching = service.switchBranch({
      worktreeId: feature.id,
      branch: 'release/0.1',
    });
    await switchStarted.promise;
    const refresh = service.refreshProject(project.id);
    await Promise.resolve();
    expect(worktreeListCalls).toBe(1);
    expect(service.snapshot().projects[0]?.worktrees[1]?.branch).toBe('feature/stacked');

    releaseSwitch.resolve();
    await switching;
    await expect(refresh).resolves.toMatchObject({
      projects: [{ worktrees: [{ branch: 'main' }, { branch: 'release/0.1' }] }],
    });
  });

  it('does not constrain non-topology reads during an active mutation', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    const switchStarted = deferred<void>();
    const releaseSwitch = deferred<void>();
    let switched = false;
    const switchedOutput = worktreeOutput.replace(
      'branch refs/heads/feature/stacked',
      'branch refs/heads/release/0.1',
    );
    const runner = new StubCommandRunner(async (spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'switch') {
        switchStarted.resolve();
        await releaseSwitch.promise;
        switched = true;
        return {};
      }
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: switched ? switchedOutput : worktreeOutput };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const initial = await service.refresh();
    const feature = initial.projects[0]?.worktrees[1];
    if (!feature) throw new Error('Expected the feature worktree.');
    const diffSession: DiffSession = {
      kind: 'branch',
      id: 'session',
      projectId: project.id,
      sourceWorktreeId: feature.id,
      branch: feature.branch,
      targetBranch: 'main',
      baseSha: 'base',
      headSha: feature.head,
      stats: { files: 0, additions: 0, deletions: 0 },
      files: [],
    };
    const listBranches = vi
      .spyOn(service.git, 'listBranches')
      .mockResolvedValue(['main', feature.branch]);
    const status = vi.spyOn(service.git, 'status').mockResolvedValue('clean');
    const openDiff = vi.spyOn(service.git, 'openDiff').mockResolvedValue(diffSession);

    const switching = service.switchBranch({
      worktreeId: feature.id,
      branch: 'release/0.1',
    });
    await switchStarted.promise;
    const reads = Promise.all([
      service.listBranches(project.id),
      service.worktreeStatus(feature.id),
      service.openDiff(feature.id),
    ]);

    expect(listBranches).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledOnce();
    expect(openDiff).toHaveBeenCalledOnce();
    await reads;
    releaseSwitch.resolve();
    await switching;
  });
});

describe('AppService branch comparisons', () => {
  it('persists a worktree comparison override and uses it when opening the diff', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: worktreeOutput };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const snapshot = await service.refresh();
    const feature = snapshot.projects[0]?.worktrees[1];
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
      diff: { files: 2, additions: 8, deletions: 3 },
    });
    const session: DiffSession = {
      kind: 'branch',
      id: 'override-session',
      projectId: project.id,
      sourceWorktreeId: feature.id,
      branch: feature.branch,
      targetBranch: 'release/next',
      baseSha: 'base',
      headSha: 'head',
      stats: { files: 2, additions: 8, deletions: 3 },
      files: [],
    };
    const openDiff = vi.spyOn(service.git, 'openDiff').mockResolvedValue(session);

    await expect(
      service.setComparisonBase({
        worktreeId: feature.id,
        targetBranch: 'release/next',
      }),
    ).resolves.toMatchObject({ targetBranch: 'release/next' });
    expect(store.state.comparisonBaseOverrides[feature.id]).toEqual({
      sourceBranch: 'feature/stacked',
      targetBranch: 'release/next',
    });
    expect(comparison).toHaveBeenCalledWith(project, feature, 'release/next');

    await expect(service.openDiff(feature.id)).resolves.toEqual(session);
    expect(openDiff).toHaveBeenCalledWith(project, feature, 'release/next');

    comparison.mockResolvedValueOnce({
      automaticBaseBranch: 'main',
      targetBranch: 'main',
      diff: { files: 1, additions: 2, deletions: 1 },
    });
    await service.setComparisonBase({ worktreeId: feature.id });
    expect(store.state.comparisonBaseOverrides[feature.id]).toBeUndefined();
  });

  it('binds editor access only to a worktree checked out on the source branch', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));
    const runner = new StubCommandRunner((spec) => {
      if (spec.tool === 'git' && spec.args[0] === 'worktree') {
        return { stdout: worktreeOutput };
      }
      if (spec.tool === 'github') return { exitCode: 1 };
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);
    const snapshot = await service.refresh();
    const sourceWorktree = snapshot.projects[0]?.worktrees.find(
      (worktree) => worktree.branch === 'feature/stacked',
    );
    if (!sourceWorktree) throw new Error('Expected the feature worktree.');
    const session: DiffSession = {
      kind: 'branch',
      id: 'session',
      projectId: project.id,
      sourceWorktreeId: sourceWorktree.id,
      branch: sourceWorktree.branch,
      targetBranch: 'main',
      baseSha: 'base',
      headSha: 'head',
      stats: { files: 0, additions: 0, deletions: 0 },
      files: [],
    };
    const openBranchDiff = vi
      .spyOn(service.git, 'openBranchDiff')
      .mockResolvedValue(session);

    await expect(
      service.openBranchDiff({
        projectId: project.id,
        sourceBranch: 'feature/stacked',
        targetBranch: 'main',
      }),
    ).resolves.toEqual(session);
    expect(openBranchDiff).toHaveBeenCalledWith(
      project,
      'feature/stacked',
      'main',
      sourceWorktree,
    );
  });

  it('rejects malformed comparison requests at the IPC boundary', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const service = new AppService(store, new StubCommandRunner(() => ({})));

    await expect(
      service.openBranchDiff({ projectId: 'project', sourceBranch: 'main' }),
    ).rejects.toThrow('Invalid branch comparison request');
    await expect(
      service.setComparisonBase({ worktreeId: 'project', targetBranch: 42 }),
    ).rejects.toThrow('Invalid comparison base request');
  });
});

describe('AppService commit changes', () => {
  it('rejects malformed commit requests at the IPC boundary', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    const service = new AppService(store, new StubCommandRunner(() => ({})));

    await expect(
      service.openCommitDiff({ projectId: 'project', commitHash: 'HEAD' }),
    ).rejects.toThrow('Invalid commit changes request');
  });
});

function worktreesFor(currentProject: Project, branches: readonly string[]): string {
  return [
    `worktree ${currentProject.path}
HEAD 1111111
branch refs/heads/main`,
    ...branches.map(
      (
        branch,
        index,
      ) => `worktree ${currentProject.path}.worktrees/${branch.replaceAll('/', '-')}
HEAD ${String(index + 2).repeat(7)}
branch refs/heads/${branch}`,
    ),
  ].join('\n\n');
}

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
