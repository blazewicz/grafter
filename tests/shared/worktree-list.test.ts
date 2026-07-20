import { describe, expect, it } from 'vitest';
import type { Worktree } from '../../src/shared/contracts';
import {
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
  it('pins main and sorts by display name without using branch or PR data', () => {
    const beta = worktree('Beta', '/worktrees/z-path');
    const alpha = worktree('alpha', '/worktrees/a-path');
    const main = worktree('main', '/projects/repo');
    main.isMain = true;
    beta.pullRequest = {
      number: 1,
      title: 'Stacked branch',
      url: 'https://github.com/example/repo/pull/1',
      state: 'OPEN',
      baseBranch: alpha.branch,
    };

    expect(sortWorktrees([beta, main, alpha])).toEqual([main, alpha, beta]);
  });
});
