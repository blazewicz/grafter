import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorktreeDetails as WorktreeDetailsData } from '../../../../src/shared/contracts';
import { WorktreeDetails } from '../../../../src/renderer/components/details/WorktreeDetails';

const details: WorktreeDetailsData = {
  id: 'project:/repo.worktrees/feature',
  projectId: 'project',
  projectName: 'repo',
  name: 'feature-worktree',
  path: '/repo.worktrees/feature',
  branch: 'feature/branch',
  head: '1234567890',
  isMain: false,
  locked: false,
  targetBranch: 'main',
  diff: { files: 1, additions: 2, deletions: 0 },
};

const mainWorktree: WorktreeDetailsData = {
  ...details,
  id: 'project:/repo',
  name: 'repo',
  path: '/repo',
  branch: 'main',
  isMain: true,
};

describe('WorktreeDetails copy controls', () => {
  it('renders the worktree-first header and accessible copy controls', () => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        details,
        projectWorktrees: [mainWorktree, details],
        status: 'clean',
        onSnapshot: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Copy feature/branch branch name"');
    expect(html).toContain('aria-label="Switch checked-out branch"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="Copy worktree path"');
    expect(html).toContain('lucide-folder-git');
    expect(html).toContain('repo</div>');
    expect(html).toContain('<h1>feature-worktree</h1>');
    expect(html).toContain('title="Switch branch"');
    expect(html).toContain('<code>feature/branch</code>');
    expect(html).toContain('<code>../repo.worktrees/feature</code>');
    expect(html).not.toContain('Checked-out branches');
  });

  it('disables branch switching with an explanation for a dirty worktree', () => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        details,
        projectWorktrees: [mainWorktree, details],
        status: 'dirty',
        onSnapshot: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain(
      'title="Commit, stash, or discard your changes before switching branches"',
    );
    expect(html).toContain(
      'aria-label="Switch branch unavailable: Commit, stash, or discard your changes before switching branches"',
    );
    expect(html).toContain('disabled=""');
  });

  it('labels the main worktree consistently and shows its PR status', () => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
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
        onError: () => undefined,
      }),
    );

    expect(html).toContain('repo</div>');
    expect(html).toContain('<h1>main</h1>');
    expect(html).toContain('Pull request #18');
    expect(html).toContain('Changes against <strong>main</strong>');
  });

  it('uses the same collision-safe worktree label as the sidebar', () => {
    const collision = {
      ...details,
      id: 'project:/other/feature',
      path: '/other/feature',
    };
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        details,
        projectWorktrees: [mainWorktree, details, collision],
        status: 'clean',
        onSnapshot: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('<h1>repo.worktrees/feature</h1>');
  });

  it('expands the heading when the linked worktree matches the main clone name', () => {
    const collidingDetails = {
      ...details,
      name: 'repo',
      path: '/worktrees/b77c/repo',
    };
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        homeDirectory: '/repo.worktrees',
        details: collidingDetails,
        projectWorktrees: [mainWorktree, collidingDetails],
        status: 'clean',
        onSnapshot: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('<h1>b77c/repo</h1>');
  });
});
