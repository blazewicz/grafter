import { describe, expect, it } from 'vitest';
import type { Worktree } from '../../src/shared/contracts';
import { buildWorktreeList } from '../../src/shared/worktree-list';

function worktree(name: string, path: string): Worktree {
  return {
    id: `project:${path}`,
    projectId: 'project',
    name,
    path,
    branch: `branch/${name}`,
    head: name,
    isMain: false,
    locked: false,
  };
}

describe('buildWorktreeList', () => {
  it('sorts worktrees alphabetically without using branch or pull request data', () => {
    const beta = worktree('Beta', '/worktrees/Beta');
    const alpha = worktree('alpha', '/worktrees/alpha');
    beta.pullRequest = {
      number: 1,
      title: 'Stacked branch',
      url: 'https://github.com/example/repo/pull/1',
      state: 'OPEN',
      baseBranch: alpha.branch,
    };

    expect(buildWorktreeList([beta, alpha])).toEqual([
      { worktree: alpha, displayName: 'alpha' },
      { worktree: beta, displayName: 'Beta' },
    ]);
  });

  it('uses the shortest unique parent suffix for duplicate basenames', () => {
    const worktrees = [
      worktree('grafter', '/Users/kasia/projects/grafter'),
      worktree('grafter', '/Users/kasia/scratch/grafter'),
      worktree('grafter', '/Volumes/archive/scratch/grafter'),
      worktree('other', '/Users/kasia/projects/other'),
    ];

    expect(
      buildWorktreeList(worktrees).map(({ worktree: item, displayName }) => ({
        path: item.path,
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

  it('pins the main worktree and reserves its display label', () => {
    const main = worktree('repo', '/Users/kasia/projects/repo');
    main.isMain = true;
    main.branch = 'feature/from-main';
    const linkedMain = worktree('main', '/Users/kasia/scratch/main');
    const alpha = worktree('alpha', '/Users/kasia/worktrees/alpha');

    expect(
      buildWorktreeList([linkedMain, alpha, main]).map(
        ({ worktree: item, displayName }) => ({
          path: item.path,
          displayName,
        }),
      ),
    ).toEqual([
      {
        path: '/Users/kasia/projects/repo',
        displayName: 'main',
      },
      {
        path: '/Users/kasia/worktrees/alpha',
        displayName: 'alpha',
      },
      {
        path: '/Users/kasia/scratch/main',
        displayName: 'scratch/main',
      },
    ]);
  });

  it('expands a linked worktree that shares the main clone basename', () => {
    const main = worktree('git-workflow-app', '/Users/kasia/projects/git-workflow-app');
    main.isMain = true;
    const linked = worktree(
      'git-workflow-app',
      '/Users/kasia/.codex/worktrees/b77c/git-workflow-app',
    );

    expect(buildWorktreeList([linked, main])).toEqual([
      { worktree: main, displayName: 'main' },
      { worktree: linked, displayName: 'b77c/git-workflow-app' },
    ]);
  });
});
