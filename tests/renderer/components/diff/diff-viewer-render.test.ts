import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  BranchDiffSession,
  CommitDiffSession,
  DiffFileStatus,
} from '../../../../src/shared/contracts';
import { DiffViewer } from '../../../../src/renderer/components/diff/DiffViewer';

const expectedPresentation: Record<
  DiffFileStatus,
  { icon: string; color: string; tone: string }
> = {
  added: { icon: 'file-plus', color: 'var(--green)', tone: 'positive' },
  copied: { icon: 'copy', color: '#858791', tone: 'neutral' },
  deleted: { icon: 'file-minus', color: 'var(--red)', tone: 'negative' },
  modified: { icon: 'file-diff', color: '#858791', tone: 'neutral' },
  renamed: { icon: 'file-symlink', color: '#858791', tone: 'neutral' },
  'type-changed': { icon: 'file-cog', color: '#858791', tone: 'neutral' },
};

const statuses = Object.keys(expectedPresentation) as DiffFileStatus[];
const session: BranchDiffSession = {
  kind: 'branch',
  id: 'session',
  projectId: 'project',
  sourceWorktreeId: 'worktree',
  branch: 'feature/diff-icons',
  targetBranch: 'main',
  baseSha: 'base',
  headSha: 'head',
  stats: { files: statuses.length, additions: 6, deletions: 6 },
  files: statuses.map((status, index) => ({
    id: `file-${index}`,
    path: `src/${status}.ts`,
    ...(status === 'copied' || status === 'renamed'
      ? { previousPath: `src/old-${status}.ts` }
      : {}),
    status,
    additions: 1,
    deletions: 1,
    binary: false,
  })),
};

describe('DiffViewer file status presentation', () => {
  it('uses the same status icon and color in the tree and file header', () => {
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        session,
        onSessionChange: () => undefined,
        onClose: () => undefined,
        onError: () => undefined,
        settings: { dateFormat: 'system', timeFormat: 'system' },
        systemLocale: 'en-US',
      }),
    );

    for (const status of statuses) {
      const { icon, color, tone } = expectedPresentation[status];
      const matchingIcons = html.match(
        new RegExp(
          `<svg(?=[^>]*class="[^"]*lucide-${icon}[^"]*")(?=[^>]*style="color:${escapeRegExp(color)}")(?=[^>]*data-file-status="${status}")(?=[^>]*data-status-tone="${tone}")[^>]*>`,
          'g',
        ),
      );
      expect(matchingIcons, status).toHaveLength(2);
    }
  });

  it('renders expanded file controls without a textual status pill', () => {
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        session,
        onSessionChange: () => undefined,
        onClose: () => undefined,
        onError: () => undefined,
        settings: { dateFormat: 'system', timeFormat: 'system' },
        systemLocale: 'en-US',
      }),
    );

    expect(html.match(/aria-label="Collapse [^"]+ diff"/g)).toHaveLength(statuses.length);
    expect(html.match(/data-brand-mark="visual-studio-code"/g)).toHaveLength(
      statuses.length,
    );
    expect(html).not.toContain('>MODIFIED<');
    expect(html).not.toContain('>RENAMED<');
  });

  it('exposes branch comparison controls and disables editors without a source worktree', () => {
    const detachedSession = structuredClone(session);
    delete detachedSession.sourceWorktreeId;
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        session: detachedSession,
        onSessionChange: () => undefined,
        onClose: () => undefined,
        onError: () => undefined,
        settings: { dateFormat: 'system', timeFormat: 'system' },
        systemLocale: 'en-US',
      }),
    );

    expect(html).toContain('aria-label="Choose source branch"');
    expect(html).toContain('aria-label="Choose destination branch"');
    expect(html).toContain('aria-label="Swap source and destination branches"');
    expect(html).toContain(
      'title="Check out the source branch in a worktree to open files in an editor"',
    );
    expect(html.match(/disabled=""/g)).toHaveLength(statuses.length * 2);
  });

  it('renders commit identity without branch or editor controls', () => {
    const commitSession: CommitDiffSession = {
      kind: 'commit',
      id: 'commit-session',
      projectId: 'project',
      baseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      headSha: '1234567890abcdef1234567890abcdef12345678',
      stats: session.stats,
      files: session.files,
      commit: {
        hash: '1234567890abcdef1234567890abcdef12345678',
        title: 'Show commit changes',
        body: 'Keep the existing diff experience.',
        authorName: 'Ada Lovelace',
        authorEmail: 'ada@example.com',
        authoredAt: '2026-07-21T12:30:00+02:00',
        stats: session.stats,
      },
      parentShas: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    };
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        session: commitSession,
        onSessionChange: () => undefined,
        onClose: () => undefined,
        onError: () => undefined,
        settings: { dateFormat: 'year-month-day', timeFormat: '24-hour' },
        systemLocale: 'en-US',
      }),
    );

    expect(html).toContain('Show commit changes');
    expect(html).toContain('>1234567</code>');
    expect(html).toContain('aria-label="Copy full commit hash"');
    expect(html.indexOf('>1234567</code>')).toBeLessThan(
      html.indexOf('Show commit changes'),
    );
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('aria-label="Show commit details"');
    expect(html).not.toContain('Choose source branch');
    expect(html).not.toContain('Choose destination branch');
    expect(html).not.toContain('data-brand-mark="visual-studio-code"');
    expect(html).not.toContain('Open in VS Code');
  });

  it('describes a commit with no file changes', () => {
    const emptyCommitSession: CommitDiffSession = {
      kind: 'commit',
      id: 'empty-commit-session',
      projectId: 'project',
      baseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      headSha: '1234567890abcdef1234567890abcdef12345678',
      stats: { files: 0, additions: 0, deletions: 0 },
      files: [],
      commit: {
        hash: '1234567890abcdef1234567890abcdef12345678',
        title: 'Record a release marker',
        body: '',
        authorName: 'Ada Lovelace',
        authoredAt: '2026-07-21T12:30:00+02:00',
        stats: { files: 0, additions: 0, deletions: 0 },
      },
      parentShas: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    };
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        session: emptyCommitSession,
        onSessionChange: () => undefined,
        onClose: () => undefined,
        onError: () => undefined,
        settings: { dateFormat: 'system', timeFormat: 'system' },
        systemLocale: 'en-US',
      }),
    );

    expect(html).toContain('This commit has no file changes');
    expect(html).toContain('No changed files');
    expect(html).not.toContain('No files match');
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
