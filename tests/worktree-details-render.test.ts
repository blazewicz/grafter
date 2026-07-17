import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorktreeDetails as WorktreeDetailsData } from '../src/shared/contracts';
import { WorktreeDetails } from '../src/renderer/components/details/WorktreeDetails';

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

describe('WorktreeDetails copy controls', () => {
  it('renders accessible copy buttons for the branch name and worktree path', () => {
    const html = renderToStaticMarkup(
      createElement(WorktreeDetails, {
        details,
        projectWorktrees: [details],
        status: 'clean',
        onError: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Copy feature/branch branch name"');
    expect(html).toContain('aria-label="Copy worktree path"');
    expect(html).toContain('<code>/repo.worktrees/feature</code>');
  });
});
