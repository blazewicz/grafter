import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorktreeDetails } from '../../../../src/shared/contracts';
import {
  BranchCard,
  isLocalComparisonCurrent,
} from '../../../../src/renderer/components/details/BranchCard';

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

const comparison = {
  worktreeId: details.id,
  branch: details.branch,
  head: details.head,
  sourceAutomaticBaseBranch: 'main',
  targetBranch: 'release/next',
  comparisonBaseOverride: 'release/next',
  diffStats: { files: 1, additions: 2, deletions: 1 },
};

function renderBranchCard(
  nextDetails: WorktreeDetails,
  status: 'clean' | 'dirty' = 'clean',
  onOpenDiff?: () => void,
): string {
  return renderToStaticMarkup(
    createElement(BranchCard, {
      details: nextDetails,
      projectWorktrees: [details, nextDetails],
      status,
      copiedText: undefined,
      diffOpening: false,
      onSnapshot: () => undefined,
      onCopy: () => undefined,
      ...(onOpenDiff ? { onOpenDiff } : {}),
      onError: () => undefined,
    }),
  );
}

describe('BranchCard local comparison state', () => {
  it('accepts state created from the current worktree details', () => {
    expect(isLocalComparisonCurrent(comparison, details)).toBe(true);
  });

  it.each([
    ['worktree', { ...comparison, worktreeId: 'project:/repo.worktrees/other' }],
    ['branch', { ...comparison, branch: 'feature/other' }],
    ['head', { ...comparison, head: '7654321' }],
    ['automatic base', { ...comparison, sourceAutomaticBaseBranch: 'develop' }],
    [
      'automatic base availability',
      { ...comparison, sourceAutomaticBaseBranchUnavailable: true },
    ],
  ])('rejects state from a different %s', (_label, staleComparison) => {
    expect(isLocalComparisonCurrent(staleComparison, details)).toBe(false);
  });
});

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

  it('notifies when a pull request base is unavailable locally', () => {
    const html = renderBranchCard({
      ...details,
      pullRequest: {
        number: 18,
        title: 'Stacked pull request',
        url: 'https://github.com/example/repo/pull/18',
        state: 'OPEN',
        baseBranch: 'feature/merged-base',
      },
      automaticBaseBranch: 'feature/merged-base',
      automaticBaseBranchUnavailable: true,
      targetBranch: 'main',
    });

    expect(html).toContain(
      'PR base <code>feature/merged-base</code> is not available locally',
    );
    expect(html).toContain('<code>main</code>');
  });

  it('keeps an unavailable saved comparison base visible and selectable', () => {
    const detailsWithoutDiff = { ...details };
    delete detailsWithoutDiff.diffStats;
    const html = renderBranchCard(
      {
        ...detailsWithoutDiff,
        automaticBaseBranch: 'main',
        targetBranch: 'release/next',
        comparisonBaseOverride: 'release/next',
        comparisonBaseOverrideUnavailable: true,
      },
      'clean',
      () => undefined,
    );

    expect(html).toContain('<code>release/next</code>');
    expect(html).toContain(
      'Comparison base <code>release/next</code> is not available locally. Choose another branch.',
    );
    expect(html).toContain('aria-label="Choose comparison base"');
    expect(html).not.toContain('aria-label="View branch diff"');
  });
});
