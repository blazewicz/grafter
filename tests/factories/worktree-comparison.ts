import { Factory } from 'fishery';
import type { WorktreeComparison } from '../../src/shared/contracts';
import { diffStatsFactory } from './diff-stats';

export const worktreeComparisonFactory = Factory.define<WorktreeComparison>(() => ({
  automaticBaseBranch: 'main',
  targetBranch: 'main',
  diffStats: diffStatsFactory.build(),
}));
