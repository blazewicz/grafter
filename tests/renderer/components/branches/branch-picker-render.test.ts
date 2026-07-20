import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchPicker } from '../../../../src/renderer/components/branches/BranchPicker';
import type { Worktree } from '../../../../src/shared/contracts';

const worktrees: Worktree[] = [
  {
    id: 'project:/repo',
    projectId: 'project',
    displayName: 'main',
    path: '/repo',
    branch: 'main',
    head: '1111111',
    isMain: true,
    locked: false,
  },
  {
    id: 'project:/repo.worktrees/feature',
    projectId: 'project',
    displayName: 'feature',
    path: '/repo.worktrees/feature',
    branch: 'feature/current',
    head: '2222222',
    isMain: false,
    locked: false,
  },
];

describe('BranchPicker', () => {
  it('disables branches checked out in this or another worktree', () => {
    const html = renderToStaticMarkup(
      createElement(BranchPicker, {
        branches: ['feature/current', 'feature/available', 'main'],
        worktrees,
        currentWorktreeId: 'project:/repo.worktrees/feature',
        onSelect: () => undefined,
      }),
    );

    expect(html).toContain(
      'title="Currently checked out in this worktree" aria-label="feature/current: Currently checked out in this worktree"',
    );
    expect(html).toContain(
      'title="Already checked out in main" aria-label="main: Already checked out in main"',
    );
    expect(html).toContain('aria-label="feature/available"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
