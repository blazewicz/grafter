import { describe, expect, it } from 'vitest';
import type { Worktree } from '../../src/shared/contracts';
import {
  filterWorktrees,
  resolveWorktreeDisplayNames,
  sortWorktrees,
  type WorktreeWithoutDisplayName,
} from '../../src/shared/worktree-list';

function worktreeCandidate(path: string): WorktreeWithoutDisplayName {
  return {
    id: `project:${path}`,
    projectId: 'project',
    path,
    branch: `branch/${path}`,
    head: path,
    isMain: false,
    locked: false,
  };
}

function worktree(displayName: string, path: string): Worktree {
  return {
    ...worktreeCandidate(path),
    displayName,
  };
}

describe('resolveWorktreeDisplayNames', () => {
  it('uses the shortest unique parent suffix for duplicate basenames', () => {
    const worktrees = [
      worktreeCandidate('/Users/kasia/projects/grafter'),
      worktreeCandidate('/Users/kasia/scratch/grafter'),
      worktreeCandidate('/Volumes/archive/scratch/grafter'),
      worktreeCandidate('/Users/kasia/projects/other'),
    ];

    expect(
      resolveWorktreeDisplayNames(worktrees).map(({ path, displayName }) => ({
        path,
        displayName,
      })),
    ).toEqual([
      {
        path: '/Users/kasia/projects/grafter',
        displayName: 'projects/grafter',
      },
      {
        path: '/Users/kasia/scratch/grafter',
        displayName: 'kasia/scratch/grafter',
      },
      {
        path: '/Volumes/archive/scratch/grafter',
        displayName: 'archive/scratch/grafter',
      },
      {
        path: '/Users/kasia/projects/other',
        displayName: 'other',
      },
    ]);
  });

  it('reserves main for the main worktree', () => {
    const main = worktreeCandidate('/Users/kasia/projects/repo');
    main.isMain = true;
    main.branch = 'feature/from-main';
    const linkedMain = worktreeCandidate('/Users/kasia/scratch/main');
    const alpha = worktreeCandidate('/Users/kasia/worktrees/alpha');

    expect(
      resolveWorktreeDisplayNames([linkedMain, alpha, main]).map(
        ({ path, displayName }) => ({
          path,
          displayName,
        }),
      ),
    ).toEqual([
      {
        path: '/Users/kasia/scratch/main',
        displayName: 'scratch/main',
      },
      {
        path: '/Users/kasia/worktrees/alpha',
        displayName: 'alpha',
      },
      {
        path: '/Users/kasia/projects/repo',
        displayName: 'main',
      },
    ]);
  });

  it('expands a linked worktree that shares the main clone basename', () => {
    const main = worktreeCandidate('/Users/kasia/projects/git-workflow-app');
    main.isMain = true;
    const linked = worktreeCandidate(
      '/Users/kasia/.codex/worktrees/b77c/git-workflow-app',
    );

    expect(resolveWorktreeDisplayNames([linked, main])).toMatchObject([
      { path: linked.path, displayName: 'b77c/git-workflow-app' },
      { path: main.path, displayName: 'main' },
    ]);
  });

  it('recalculates existing labels when a collision is added or removed', () => {
    const alpha = worktreeCandidate('/worktrees/alpha/repo');
    const beta = worktreeCandidate('/worktrees/beta/repo');

    expect(resolveWorktreeDisplayNames([alpha])).toMatchObject([
      { path: alpha.path, displayName: 'repo' },
    ]);
    expect(resolveWorktreeDisplayNames([alpha, beta])).toMatchObject([
      { path: alpha.path, displayName: 'alpha/repo' },
      { path: beta.path, displayName: 'beta/repo' },
    ]);
    expect(resolveWorktreeDisplayNames([beta])).toMatchObject([
      { path: beta.path, displayName: 'repo' },
    ]);
  });
});

describe('sortWorktrees', () => {
  it('pins main and sorts by path without using display name or PR data', () => {
    const firstByPath = worktree('Zulu', '/worktrees/a-path');
    const lastByPath = worktree('alpha', '/worktrees/z-path');
    const main = worktree('main', '/projects/repo');
    main.isMain = true;
    lastByPath.pullRequest = {
      number: 1,
      title: 'Stacked branch',
      url: 'https://github.com/example/repo/pull/1',
      state: 'OPEN',
      baseBranch: firstByPath.branch,
    };

    expect(sortWorktrees([lastByPath, main, firstByPath], 'path')).toEqual([
      main,
      firstByPath,
      lastByPath,
    ]);
  });

  it('preserves display-name sorting for callers without an explicit order', () => {
    const firstByName = worktree('alpha', '/worktrees/z-path');
    const lastByName = worktree('Zulu', '/worktrees/a-path');
    const main = worktree('main', '/projects/repo');
    main.isMain = true;

    expect(sortWorktrees([lastByName, main, firstByName])).toEqual([
      main,
      firstByName,
      lastByName,
    ]);
  });

  it('pins main and sorts by branch with path as a tie-breaker', () => {
    const lastByBranch = worktree('alpha', '/worktrees/a-path');
    lastByBranch.branch = 'z-last';
    const lastByPath = worktree('beta', '/worktrees/z-path');
    lastByPath.branch = 'a-first';
    const firstByPath = worktree('gamma', '/worktrees/b-path');
    firstByPath.branch = 'a-first';
    const main = worktree('main', '/projects/repo');
    main.isMain = true;

    expect(
      sortWorktrees([lastByBranch, lastByPath, main, firstByPath], 'branch'),
    ).toEqual([main, firstByPath, lastByPath, lastByBranch]);
  });
});

describe('filterWorktrees', () => {
  function matchedWorktrees(worktrees: readonly Worktree[], query: string): Worktree[] {
    return filterWorktrees(worktrees, query).map((match) => match.worktree);
  }

  it('matches path and branch case-insensitively without mutating the input', () => {
    const byPath = worktree('path match', '/worktrees/Feature-Search');
    byPath.branch = 'unrelated';
    const byBranch = worktree('branch match', '/worktrees/unrelated');
    byBranch.branch = 'Feature/Branch-Search';
    const other = worktree('other', '/worktrees/other');
    other.branch = 'feature/other';
    const worktrees = [byPath, byBranch, other];

    expect(matchedWorktrees(worktrees, '  worktrees/feature-search  ')).toEqual([byPath]);
    expect(matchedWorktrees(worktrees, 'BRANCH-SEARCH')).toEqual([byBranch]);
    expect(worktrees).toEqual([byPath, byBranch, other]);
  });

  it('returns every worktree with empty indexes for a blank query', () => {
    const worktrees = [
      worktree('first', '/worktrees/first'),
      worktree('second', '/worktrees/second'),
    ];

    expect(filterWorktrees(worktrees, '   ')).toEqual([
      { worktree: worktrees[0], displayNameIndexes: [], branchIndexes: [] },
      { worktree: worktrees[1], displayNameIndexes: [], branchIndexes: [] },
    ]);
    expect(filterWorktrees(worktrees, '')).not.toBe(worktrees);
  });

  it('matches characters in order with anything in between', () => {
    const byPath = worktree('path match', '/worktrees/repo-scoped-windows');
    byPath.branch = 'unrelated';
    const other = worktree('other', '/worktrees/other');
    other.branch = 'feature/other';

    expect(matchedWorktrees([byPath, other], 'rpo')).toEqual([byPath]);
    expect(matchedWorktrees([byPath, other], 'scopedwin')).toEqual([byPath]);
  });

  it('rejects queries whose characters are out of order', () => {
    const byPath = worktree('path match', '/x/repo-scoped-windows');
    byPath.branch = 'unrelated';

    expect(matchedWorktrees([byPath], 'orp')).toEqual([]);
    expect(matchedWorktrees([byPath], 'sela')).toEqual([]);
  });

  it('splits the query on spaces and matches the parts in order', () => {
    const byPath = worktree('path match', '/worktrees/repo-scoped-windows');
    byPath.branch = 'unrelated';

    expect(matchedWorktrees([byPath], 'repo window')).toEqual([byPath]);
  });

  it('ranks tighter matches ahead of scattered ones', () => {
    const tight = worktree('tight', '/worktrees/project-windows');
    tight.branch = 'feature/win';
    const scattered = worktree('scattered', '/worktrees/win-d-ow');
    scattered.branch = 'feature/x';

    expect(matchedWorktrees([scattered, tight], 'window')).toEqual([tight, scattered]);
  });

  it('pins the main worktree above better-scoring linked worktrees', () => {
    const main = worktree('main', '/projects/grafter-app');
    main.branch = 'main';
    main.isMain = true;
    const exact = worktree('exact', '/worktrees/grafter');
    exact.branch = 'feature/win';
    const scattered = worktree('scattered', '/worktrees/g-x-r-a-f-t-e-r');
    scattered.branch = 'feature/zz';

    expect(matchedWorktrees([exact, scattered, main], 'grafter')).toEqual([
      main,
      exact,
      scattered,
    ]);
  });

  it('reports matched character indexes for the visible labels', () => {
    const byName = worktree('repo-scoped-windows', '/worktrees/repo-scoped-windows');
    byName.branch = 'feature/windows';
    const other = worktree('other', '/worktrees/other');
    other.branch = 'main/other';

    expect(filterWorktrees([byName, other], 'scopedwin')).toEqual([
      {
        worktree: byName,
        displayNameIndexes: [5, 6, 7, 8, 9, 10, 12, 13, 14],
        branchIndexes: [],
      },
    ]);
    expect(filterWorktrees([byName, other], 'feature')).toEqual([
      {
        worktree: byName,
        displayNameIndexes: [],
        branchIndexes: [0, 1, 2, 3, 4, 5, 6],
      },
    ]);
  });
});
