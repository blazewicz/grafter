import type {
  DiffStats,
  PullRequest,
  Worktree,
  WorktreeComparison,
  WorktreeDetails,
} from '../../../src/shared/contracts';
import {
  diffStatsFactory,
  pullRequestFactory,
  worktreeComparisonFactory,
  worktreeFactory,
} from '../../factories';
import { fakeSlug } from '../../factories/faker';
import {
  buildWorktreeProjectScenario,
  replaceScenarioDetails,
  type WorktreeProjectScenario,
} from './worktree-project';

type AvailableComparison = WorktreeComparison & {
  automaticBaseBranch: string;
  targetBranch: string;
  diffStats: DiffStats;
};

type OverrideComparison = AvailableComparison & {
  comparisonBaseOverride: string;
};

export interface BranchComparisonScenario extends WorktreeProjectScenario {
  availableWorktree: Worktree;
  branches: string[];
  pullRequest: PullRequest;
  automaticComparison: AvailableComparison;
  overrideComparison: OverrideComparison;
  automaticDetails: WorktreeDetails;
  overrideDetails: WorktreeDetails;
  unavailablePullRequestDetails: WorktreeDetails;
  unavailableOverrideDetails: WorktreeDetails;
}

export function buildBranchComparisonScenario(): BranchComparisonScenario {
  const initial = buildWorktreeProjectScenario();
  const details = {
    ...initial.details,
    automaticBaseBranch: initial.mainWorktree.branch,
  };
  const scenario = replaceScenarioDetails(initial, details);
  const availableWorktree = worktreeFactory.build({
    projectId: scenario.project.id,
    branch: `${scenario.details.branch}-${fakeSlug('comparison')}`,
  });
  const automaticDefaults = worktreeComparisonFactory.build();
  const automaticComparison: AvailableComparison = {
    ...automaticDefaults,
    automaticBaseBranch: scenario.mainWorktree.branch,
    targetBranch: scenario.mainWorktree.branch,
    diffStats: automaticDefaults.diffStats ?? diffStatsFactory.build(),
  };
  const overrideDefaults = worktreeComparisonFactory.build();
  const overrideComparison: OverrideComparison = {
    ...overrideDefaults,
    automaticBaseBranch: scenario.mainWorktree.branch,
    targetBranch: availableWorktree.branch,
    comparisonBaseOverride: availableWorktree.branch,
    diffStats: overrideDefaults.diffStats ?? diffStatsFactory.build(),
  };
  const pullRequest = pullRequestFactory.build({
    baseBranch: scenario.mainWorktree.branch,
  });
  const unavailableBranch = `${availableWorktree.branch}-${fakeSlug('unavailable')}`;
  const unavailablePullRequest = pullRequestFactory.build({
    baseBranch: unavailableBranch,
  });

  return {
    ...scenario,
    availableWorktree,
    branches: [
      scenario.mainWorktree.branch,
      scenario.details.branch,
      availableWorktree.branch,
    ],
    pullRequest,
    automaticComparison,
    overrideComparison,
    automaticDetails: { ...scenario.details, ...automaticComparison },
    overrideDetails: { ...scenario.details, ...overrideComparison },
    unavailablePullRequestDetails: {
      ...scenario.details,
      ...automaticComparison,
      pullRequest: unavailablePullRequest,
      automaticBaseBranch: unavailableBranch,
      automaticBaseBranchUnavailable: true,
    },
    unavailableOverrideDetails: {
      ...scenario.details,
      automaticBaseBranch: overrideComparison.automaticBaseBranch,
      targetBranch: overrideComparison.targetBranch,
      comparisonBaseOverride: overrideComparison.comparisonBaseOverride,
      comparisonBaseOverrideUnavailable: true,
    },
  };
}
