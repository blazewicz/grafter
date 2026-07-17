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
  it('shows cached full PR data, replaces it in the background, and preserves it on failure', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-app-service-'));
    const store = new StateStore(directory);
    await store.load();
    await store.update((state) => state.projects.push(project));

    let featurePullRequestCalls = 0;
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
          return { stdout: pullRequestJson('Cached title', 'OPEN', true) };
        }
        if (featurePullRequestCalls === 2) {
          return { stdout: pullRequestJson('Fresh title', 'OPEN', false) };
        }
        return { exitCode: 1, stderr: 'network unavailable' };
      }
      throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
    });
    const service = new AppService(store, runner);

    const initial = await service.refresh();
    const worktree = initial.projects[0]?.worktrees[1];
    expect(worktree).toBeDefined();
    if (!worktree) throw new Error('Expected the feature worktree.');
    expect(worktree.pullRequest).toEqual({
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
      title: 'Fresh title',
      state: 'OPEN',
    });
    expect(service.snapshot().projects[0]?.worktrees[1]?.pullRequest).toMatchObject({
      title: 'Fresh title',
      state: 'OPEN',
    });

    await expect(service.refreshPullRequest(worktree.id)).resolves.toMatchObject({
      title: 'Fresh title',
      state: 'OPEN',
    });
    expect(service.snapshot().projects[0]?.worktrees[1]?.pullRequest?.title).toBe(
      'Fresh title',
    );
  });
});
