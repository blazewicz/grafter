import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorktreeDetails } from '../../../../src/shared/contracts';
import { BranchCard } from '../../../../src/renderer/components/details/BranchCard';

const details: WorktreeDetails = {
  id: 'project:/repo.worktrees/feature',
  projectId: 'project',
  projectName: 'project',
  displayName: 'feature',
  path: '/repo.worktrees/feature',
  branch: 'feature/change',
  head: '1234567',
  isMain: false,
  locked: false,
  automaticBaseBranch: 'main',
};

function renderBranchCard(
  nextDetails: WorktreeDetails,
  status: 'clean' | 'dirty' = 'clean',
): string {
  return renderToStaticMarkup(
    createElement(BranchCard, {
      details: nextDetails,
      projectWorktrees: [details, nextDetails],
      status,
      copiedText: undefined,
      onSnapshot: () => undefined,
      onCopy: () => undefined,
      onError: () => undefined,
    }),
  );
}

describe('BranchCard rendering', () => {
  it('disables branch switching with an explanation for a dirty worktree', () => {
    const html = renderBranchCard(details, 'dirty');

    expect(html).toContain(
      'role="tooltip">Commit, stash, or discard your changes before switching branches</span>',
    );
    expect(html).toContain(
      'aria-label="Switch branch unavailable: Commit, stash, or discard your changes before switching branches"',
    );
    expect(html).toContain('aria-disabled="true"');
  });

  it('contains only checked-out branch controls before its pull request child', () => {
    const html = renderBranchCard({
      ...details,
      pullRequest: {
        number: 18,
        title: 'Stacked pull request',
        url: 'https://github.com/example/repo/pull/18',
        state: 'OPEN',
        baseBranch: 'feature/merged-base',
      },
    });

    expect(html).toContain('CHECKED-OUT BRANCH');
    expect(html).toContain('PULL REQUEST');
    expect(html).not.toContain('BRANCH CHANGES');
    expect(html).not.toContain('Choose target branch');
  });
});
