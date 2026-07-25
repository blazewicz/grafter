import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorktreeDetails as WorktreeDetailsData } from '../../../../src/shared/contracts';
import { WorktreeDetailsView } from '../../../../src/renderer/components/details/WorktreeDetailsView';

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
  targetBranch: 'main',
  diffStats: { files: 2, additions: 8, deletions: 2 },
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

describe('WorktreeDetails rendering', () => {
  it('renders the worktree-first header and accessible copy controls', () => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        ...displayPreferences,
        details,
        projectWorktrees: [mainWorktree, details],
        status: 'clean',
        onSnapshot: () => undefined,
        onOpenDiff: () => undefined,
        onOpenCommitDiff: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Copy feature/branch branch name"');
    expect(html).toContain('aria-label="Switch checked-out branch"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="Copy worktree path"');
    expect(html).toContain('data-brand-mark="finder"');
    expect(html).toContain('data-brand-mark="visual-studio-code"');
    expect(html).toContain('2 files');
    expect(html).toContain('aria-label="8 additions">+8</strong>');
    expect(html).toContain('aria-label="2 deletions">−2</strong>');
    expect(html).toContain('aria-label="View branch diff"');
    expect(html).toContain('lucide-file-diff');
    expect(html).toContain('role="tooltip">Switch branch</span>');
    expect(html).toContain('<code>feature/branch</code>');
    expect(html).toContain('CHECKED-OUT BRANCH');
    expect(html).toContain('BRANCH CHANGES');
    expect(html).toContain('Changes into');
    expect(html).toContain('aria-label="Choose target branch"');
    expect(html).toContain('aria-label="Copy main branch name"');
    expect(html).toContain('aria-label="Branch comparison stats"');
    expect(html).toContain('aria-label="Commits to merge"');
    expect(html).not.toContain('PULL REQUEST');
    expect(html).not.toContain('No pull request found');
    expect(html).toContain('<code>../repo.worktrees/feature</code>');
    expect(html).not.toContain('Checked-out branches');
  });

  it('uses a singular file label for a one-file branch comparison', () => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        ...displayPreferences,
        details: {
          ...details,
          diffStats: { files: 1, additions: 3, deletions: 0 },
        },
        projectWorktrees: [mainWorktree, details],
        status: 'clean',
        onSnapshot: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('1 file');
    expect(html).not.toContain('1 files');
    expect(html).toContain('BRANCH CHANGES');
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
          diffStats: { files: 2, additions: 3, deletions: 1 },
        },
        projectWorktrees: [mainWorktree, details],
        status: 'clean',
        onSnapshot: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Pull request #18"');
    expect(html).toContain('PULL REQUEST');
    expect(html).toContain('>#18</span>');
    expect(html).toContain('PR from the main clone');
    expect(html).toContain('aria-label="Open pull request #18: PR from the main clone"');
    expect(html).toContain('lucide-git-pull-request');
    expect(html).toContain('lucide-square-arrow-out-up-right');
    expect(html).toContain('BRANCH CHANGES');
    expect(html).toContain('Changes into');
    expect(html).toContain('<code>main</code>');
    expect(html.indexOf('PULL REQUEST')).toBeLessThan(html.indexOf('BRANCH CHANGES'));
  });
});
