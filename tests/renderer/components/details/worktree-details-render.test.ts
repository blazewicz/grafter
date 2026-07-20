import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorktreeDetails as WorktreeDetailsData } from '../../../../src/shared/contracts';
import { WorktreeDetails } from '../../../../src/renderer/components/details/WorktreeDetails';

const details: WorktreeDetailsData = {
  id: 'project:/repo.worktrees/feature',
  projectId: 'project',
  projectName: 'repo',
  displayName: 'feature-worktree',
  path: '/repo.worktrees/feature',
  branch: 'feature/branch',
  head: '1234567890',
  isMain: false,
  locked: false,
  commit: {
    hash: '1234567890abcdef',
    title: 'Add commit details',
    body: 'Explain the intent.\n\nKeep the body readable.',
    authorName: 'Ada Lovelace',
    authorEmail: 'ada@example.com',
    authoredAt: '2026-07-19T14:25:00+02:00',
    stats: { files: 2, additions: 8, deletions: 2 },
  },
  targetBranch: 'main',
  diff: { files: 1, additions: 2, deletions: 0 },
};

const mainWorktree: WorktreeDetailsData = {
  ...details,
  id: 'project:/repo',
  displayName: 'main',
  path: '/repo',
  branch: 'main',
  isMain: true,
};

const displayPreferences = {
  settings: {
    dateFormat: 'year-month-day',
    timeFormat: '24-hour',
  },
  systemLocale: 'en-GB',
} as const;

describe('WorktreeDetails copy controls', () => {
  it('renders the worktree-first header and accessible copy controls', () => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        ...displayPreferences,
        details,
        projectWorktrees: [mainWorktree, details],
        status: 'clean',
        onSnapshot: () => undefined,
        onSelectProject: () => undefined,
        onOpenDiff: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Copy feature/branch branch name"');
    expect(html).toContain('aria-label="Switch checked-out branch"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="Copy worktree path"');
    expect(html).toContain('data-brand-mark="finder"');
    expect(html).toContain('data-brand-mark="visual-studio-code"');
    expect(html).toContain('aria-label="Copy full commit hash"');
    expect(html).toContain('<code title="1234567890abcdef">1234567</code>');
    expect(html).toContain('Add commit details');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('lucide-git-commit-horizontal');
    expect(html).toContain('2 files');
    expect(html).toContain('aria-label="8 additions">+8</span>');
    expect(html).toContain('aria-label="2 deletions">−2</span>');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Show commit body"');
    expect(html).toContain('lucide-ellipsis');
    expect(html).not.toContain('Show commit message');
    expect(html).not.toContain('<pre');
    expect(html).toContain('lucide-folder-open');
    expect(html).toContain('View diff');
    expect(html).toContain('lucide-file-diff');
    expect(html).toContain('repo</button>');
    expect(html).toContain('aria-label="Open repo project details"');
    expect(html).toContain('<h1>feature-worktree</h1>');
    expect(html).toContain('role="tooltip">Switch branch</span>');
    expect(html).toContain('<code>feature/branch</code>');
    expect(html).toContain('<code>../repo.worktrees/feature</code>');
    expect(html).not.toContain('Checked-out branches');
  });

  it('disables branch switching with an explanation for a dirty worktree', () => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        ...displayPreferences,
        details,
        projectWorktrees: [mainWorktree, details],
        status: 'dirty',
        onSnapshot: () => undefined,
        onSelectProject: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain(
      'role="tooltip">Commit, stash, or discard your changes before switching branches</span>',
    );
    expect(html).toContain(
      'aria-label="Switch branch unavailable: Commit, stash, or discard your changes before switching branches"',
    );
    expect(html).toContain('aria-disabled="true"');
  });

  it('uses a singular file label for a one-file commit', () => {
    const commit = details.commit;
    if (!commit) throw new Error('Expected commit details.');
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        ...displayPreferences,
        details: {
          ...details,
          commit: {
            ...commit,
            body: '',
            stats: { ...commit.stats, files: 1 },
          },
        },
        projectWorktrees: [mainWorktree, details],
        status: 'clean',
        onSnapshot: () => undefined,
        onSelectProject: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('1 file');
    expect(html).not.toContain('1 files');
    expect(html).not.toContain('Show commit body');
  });

  it('labels the main worktree consistently and shows its PR status', () => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        ...displayPreferences,
        details: {
          ...mainWorktree,
          branch: 'feature/main-clone-pr',
          pullRequest: {
            number: 18,
            title: 'PR from the main clone',
            url: 'https://github.com/example/repo/pull/18',
            state: 'OPEN',
            baseBranch: 'main',
          },
          targetBranch: 'main',
          diff: { files: 2, additions: 3, deletions: 1 },
        },
        projectWorktrees: [mainWorktree, details],
        status: 'clean',
        onSnapshot: () => undefined,
        onSelectProject: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('repo</button>');
    expect(html).toContain('<h1>main</h1>');
    expect(html).toContain('aria-label="Pull request #18"');
    expect(html).toContain('PULL REQUEST');
    expect(html).toContain('>#18</span>');
    expect(html).toContain('PR from the main clone');
    expect(html).toContain('Base branch:</span><code>main</code>');
    expect(html).toContain('aria-label="Copy main base branch name"');
    expect(html).toContain('aria-label="Open pull request"');
    expect(html).toContain('lucide-git-pull-request');
    expect(html).toContain('lucide-square-arrow-out-up-right');
    expect(html).toContain('Changes against <strong>main</strong>');
  });

  it.each([
    ['OPEN', 'Open', 'lucide-git-pull-request'],
    ['DRAFT', 'Draft', 'lucide-git-pull-request-draft'],
    ['MERGED', 'Merged', 'lucide-git-merge'],
    ['CLOSED', 'Closed', 'lucide-git-pull-request-closed'],
  ] as const)('renders the %s pull request state icon', (state, label, iconClass) => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        ...displayPreferences,
        details: {
          ...details,
          pullRequest: {
            number: 18,
            title: 'State-aware pull request',
            url: 'https://github.com/example/repo/pull/18',
            state,
            baseBranch: 'main',
          },
        },
        projectWorktrees: [mainWorktree, details],
        status: 'clean',
        onSnapshot: () => undefined,
        onSelectProject: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain(`aria-label="Pull request status: ${label.toLowerCase()}"`);
    expect(html).toContain(`data-state="${state}"`);
    expect(html).toContain(iconClass);
  });

  it('uses the same collision-safe worktree label as the sidebar', () => {
    const collidingDetails = {
      ...details,
      displayName: 'repo.worktrees/feature',
    };
    const collision = {
      ...details,
      id: 'project:/other/feature',
      displayName: 'other/feature',
      path: '/other/feature',
    };
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        ...displayPreferences,
        details: collidingDetails,
        projectWorktrees: [mainWorktree, collidingDetails, collision],
        status: 'clean',
        onSnapshot: () => undefined,
        onSelectProject: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('<h1>repo.worktrees/feature</h1>');
  });

  it('expands the heading when the linked worktree matches the main clone name', () => {
    const collidingDetails = {
      ...details,
      displayName: 'b77c/repo',
      path: '/worktrees/b77c/repo',
    };
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        ...displayPreferences,
        details: collidingDetails,
        projectWorktrees: [mainWorktree, collidingDetails],
        status: 'clean',
        onSnapshot: () => undefined,
        onSelectProject: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('<h1>b77c/repo</h1>');
  });
});
