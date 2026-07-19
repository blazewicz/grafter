import { describe, expect, it } from 'vitest';
import {
  parseCommitDetails,
  parseNumStat,
  parseWorktreePorcelain,
  parseWorktreeStatus,
} from '../../src/shared/git-parsers';

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
        name: 'grafter',
        path: '/code/grafter',
        branch: 'main',
        head: 'aaaaaaa',
        isMain: true,
        locked: false,
      },
      {
        id: 'project:/code/grafter.worktrees/audit',
        projectId: 'project',
        name: 'audit',
        path: '/code/grafter.worktrees/audit',
        branch: 'feature/audit',
        head: 'bbbbbbb',
        isMain: false,
        locked: true,
      },
      {
        id: 'project:/code/grafter.worktrees/probe',
        projectId: 'project',
        name: 'probe',
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

describe('parseCommitDetails', () => {
  it('parses metadata, a multiline body, and per-commit diff stats', () => {
    expect(
      parseCommitDetails(
        '1234567890abcdef\u0000Ada Lovelace\u0000ada@example.com\u00002026-07-19T14:25:00+02:00\u0000Add commit details\u0000Explain the intent.\n\nKeep the body readable.\n\u0000\n12\t3\tsrc/a.ts\n5\t0\tsrc/b.ts\n-\t-\tasset.png\n',
      ),
    ).toEqual({
      hash: '1234567890abcdef',
      title: 'Add commit details',
      body: 'Explain the intent.\n\nKeep the body readable.',
      authorName: 'Ada Lovelace',
      authorEmail: 'ada@example.com',
      authoredAt: '2026-07-19T14:25:00+02:00',
      stats: { files: 3, additions: 17, deletions: 3 },
    });
  });

  it('rejects incomplete or invalid commit metadata', () => {
    expect(parseCommitDetails('')).toBeUndefined();
    expect(
      parseCommitDetails(
        'abc\u0000Ada\u0000ada@example.com\u0000not-a-date\u0000Title\u0000Body\u0000',
      ),
    ).toBeUndefined();
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

describe('parseWorktreeStatus', () => {
  it('marks empty porcelain output as clean', () => {
    expect(parseWorktreeStatus('')).toBe('clean');
    expect(parseWorktreeStatus('\n')).toBe('clean');
  });

  it('marks staged, unstaged, and untracked porcelain output as dirty', () => {
    expect(parseWorktreeStatus('M  src/staged.ts\n')).toBe('dirty');
    expect(parseWorktreeStatus(' M src/unstaged.ts\n')).toBe('dirty');
    expect(parseWorktreeStatus('?? src/untracked.ts\n')).toBe('dirty');
  });
});
