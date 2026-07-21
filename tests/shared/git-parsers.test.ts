import { describe, expect, it } from 'vitest';
import {
  parseCommitDetails,
  parseDiffFiles,
  parseNumStat,
  parseUnifiedDiff,
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
        displayName: 'main',
        path: '/code/grafter',
        branch: 'main',
        head: 'aaaaaaa',
        isMain: true,
        locked: false,
      },
      {
        id: 'project:/code/grafter.worktrees/audit',
        projectId: 'project',
        displayName: 'audit',
        path: '/code/grafter.worktrees/audit',
        branch: 'feature/audit',
        head: 'bbbbbbb',
        isMain: false,
        locked: true,
      },
      {
        id: 'project:/code/grafter.worktrees/probe',
        projectId: 'project',
        displayName: 'probe',
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
        '1234567890abcdef\nAda Lovelace\nada@example.com\n2026-07-19T14:25:00+02:00\nAdd commit details\nExplain the intent.\n\nKeep the body readable.\n\u0000\n12\t3\tsrc/a.ts\n5\t0\tsrc/b.ts\n-\t-\tasset.png\n',
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
      parseCommitDetails('abc\nAda\nada@example.com\nnot-a-date\nTitle\nBody\u0000'),
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

describe('parseDiffFiles', () => {
  it('joins NUL-delimited statuses and stats without relying on quoted paths', () => {
    expect(
      parseDiffFiles(
        'M\0src/with spaces.ts\0R087\0old/name.ts\0new/name.ts\0A\0asset.png\0',
        '3\t1\tsrc/with spaces.ts\0' +
          '8\t2\t\0old/name.ts\0new/name.ts\0' +
          '-\t-\tasset.png\0',
      ),
    ).toEqual([
      {
        id: 'file-0',
        path: 'src/with spaces.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        binary: false,
      },
      {
        id: 'file-1',
        path: 'new/name.ts',
        previousPath: 'old/name.ts',
        status: 'renamed',
        additions: 8,
        deletions: 2,
        binary: false,
      },
      {
        id: 'file-2',
        path: 'asset.png',
        status: 'added',
        binary: true,
      },
    ]);
  });
});

describe('parseUnifiedDiff', () => {
  it('parses hunks into line kinds and assigns both line-number columns', () => {
    expect(
      parseUnifiedDiff(
        'file-3',
        `diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -10,4 +10,5 @@ export function example() {
 const retained = true;
-const before = 'old';
+const after = 'new';
+const extra = true;
 return retained;
\\ No newline at end of file
`,
      ),
    ).toEqual({
      fileId: 'file-3',
      binary: false,
      hunks: [
        {
          header: '@@ -10,4 +10,5 @@ export function example() {',
          oldStart: 10,
          oldLines: 4,
          newStart: 10,
          newLines: 5,
          lines: [
            { kind: 'context', text: 'const retained = true;', oldLine: 10, newLine: 10 },
            { kind: 'deletion', text: "const before = 'old';", oldLine: 11 },
            { kind: 'addition', text: "const after = 'new';", newLine: 11 },
            { kind: 'addition', text: 'const extra = true;', newLine: 12 },
            { kind: 'context', text: 'return retained;', oldLine: 12, newLine: 13 },
            {
              kind: 'annotation',
              text: 'No newline at end of file',
            },
          ],
        },
      ],
    });
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
