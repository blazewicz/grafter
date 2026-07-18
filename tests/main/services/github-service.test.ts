import { describe, expect, it } from 'vitest';
import { worktreeCommandContext } from '../../../src/shared/command-context';
import type { Worktree } from '../../../src/shared/contracts';
import { GitHubService } from '../../../src/main/services/github-service';
import { StubCommandRunner } from '../support/stub-command-runner';

const worktree: Worktree = {
  id: 'project:/repo.worktrees/feature',
  projectId: 'project',
  name: 'feature',
  path: '/repo.worktrees/feature',
  branch: 'feature',
  head: 'abcdef0',
  isMain: false,
  locked: false,
};

describe('GitHubService pull requests', () => {
  it('queries gh and maps its pull request response', async () => {
    const runner = new StubCommandRunner(() => ({
      stdout: JSON.stringify({
        number: 42,
        title: 'Feature',
        url: 'https://github.com/example/repo/pull/42',
        state: 'OPEN',
        isDraft: true,
        baseRefName: 'main',
      }),
    }));
    const service = new GitHubService(runner);

    await expect(service.pullRequest(worktree)).resolves.toEqual({
      number: 42,
      title: 'Feature',
      url: 'https://github.com/example/repo/pull/42',
      state: 'DRAFT',
      baseBranch: 'main',
    });
    expect(runner.commands).toEqual([
      {
        context: worktreeCommandContext(worktree),
        tool: 'github',
        executable: 'gh',
        args: [
          'pr',
          'view',
          'feature',
          '--json',
          'number,title,url,state,isDraft,baseRefName',
        ],
        cwd: worktree.path,
        purpose: 'Find the pull request for feature',
        isReadOnly: true,
      },
    ]);
  });

  it('does not query gh for a detached worktree', async () => {
    const runner = new StubCommandRunner(() => {
      throw new Error('gh should not run');
    });
    const service = new GitHubService(runner);

    await expect(
      service.pullRequest({ ...worktree, branch: '(detached)' }),
    ).resolves.toBeUndefined();
    expect(runner.commands).toEqual([]);
  });

  it('treats failed and malformed gh responses as unavailable', async () => {
    let callCount = 0;
    const runner = new StubCommandRunner(() => {
      callCount += 1;
      return callCount === 1 ? { exitCode: 1 } : { stdout: 'not json' };
    });
    const service = new GitHubService(runner);

    await expect(service.pullRequest(worktree)).resolves.toBeUndefined();
    await expect(service.pullRequest(worktree)).resolves.toBeUndefined();
  });
});
