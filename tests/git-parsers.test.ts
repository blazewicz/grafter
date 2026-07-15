import { describe, expect, it } from 'vitest';
import { parseNumStat, parseWorktreePorcelain } from '../src/shared/git-parsers';

describe('parseWorktreePorcelain', () => {
  it('parses linked, detached, and locked worktrees while marking the main clone', () => {
    const output = `worktree /code/grafter
HEAD aaaaaaa
branch refs/heads/main

worktree /code/grafter.worktrees/audit
HEAD bbbbbbb
branch refs/heads/feature/audit
locked maintenance

worktree /code/grafter.worktrees/probe
HEAD ccccccc
detached
`;

    expect(parseWorktreePorcelain(output, 'project')).toEqual([
      {
        id: 'project:/code/grafter',
        projectId: 'project',
        path: '/code/grafter',
        branch: 'main',
        head: 'aaaaaaa',
        isMain: true,
        locked: false,
      },
      {
        id: 'project:/code/grafter.worktrees/audit',
        projectId: 'project',
        path: '/code/grafter.worktrees/audit',
        branch: 'feature/audit',
        head: 'bbbbbbb',
        isMain: false,
        locked: true,
      },
      {
        id: 'project:/code/grafter.worktrees/probe',
        projectId: 'project',
        path: '/code/grafter.worktrees/probe',
        branch: '(detached)',
        head: 'ccccccc',
        isMain: false,
        locked: false,
      },
    ]);
  });

  it('ignores bare worktrees', () => {
    expect(
      parseWorktreePorcelain('worktree /code/repo.git\nHEAD aaa\nbare\n', 'project'),
    ).toEqual([]);
  });
});

describe('parseNumStat', () => {
  it('totals additions, deletions, files, and binary changes', () => {
    expect(parseNumStat('12\t3\tsrc/a.ts\n5\t0\tsrc/b.ts\n-\t-\tasset.png\n')).toEqual({
      files: 3,
      additions: 17,
      deletions: 3,
    });
  });

  it('returns empty stats for empty output', () => {
    expect(parseNumStat('')).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});
