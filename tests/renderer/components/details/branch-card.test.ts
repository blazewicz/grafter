import { describe, expect, it } from 'vitest';
import type { WorktreeDetails } from '../../../../src/shared/contracts';
import { isLocalComparisonCurrent } from '../../../../src/renderer/components/details/BranchCard';

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
