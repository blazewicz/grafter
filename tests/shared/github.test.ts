import { describe, expect, it } from 'vitest';
import { githubFileUrl, parseGitHubRepositoryFromRemotes } from '../../src/shared/github';

describe('GitHub remotes', () => {
  it('prefers the origin fetch remote and supports SSH and HTTPS URLs', () => {
    expect(
      parseGitHubRepositoryFromRemotes(
        'upstream\thttps://github.com/upstream/project.git (fetch)\n' +
          'origin\tgit@github.com:owner/repo.git (push)\n' +
          'origin\tssh://git@github.com/owner/repo.git (fetch)\n',
      ),
    ).toEqual({ owner: 'owner', name: 'repo' });
    expect(
      parseGitHubRepositoryFromRemotes(
        'upstream\thttps://github.com/upstream/project.git (fetch)\n',
      ),
    ).toEqual({ owner: 'upstream', name: 'project' });
  });

  it('ignores non-GitHub and malformed remotes', () => {
    expect(
      parseGitHubRepositoryFromRemotes('origin\tgit@gitlab.com:owner/repo.git (fetch)\n'),
    ).toBeUndefined();
    expect(
      parseGitHubRepositoryFromRemotes('origin\thttps://github.com/owner (fetch)\n'),
    ).toBeUndefined();
  });

  it('builds encoded, commit-pinned file URLs', () => {
    expect(
      githubFileUrl({ owner: 'example', name: 'repo' }, 'abc123', 'src/a file#1.ts', 42),
    ).toBe('https://github.com/example/repo/blob/abc123/src/a%20file%231.ts#L42');
  });
});
