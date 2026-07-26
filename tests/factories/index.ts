export { appSnapshotFactory } from './app-snapshot';
export { branchCommitFactory } from './branch-commit';
export { branchCommitPageFactory } from './branch-commit-page';
export { diffStatsFactory } from './diff-stats';
export { pullRequestFactory } from './pull-request';
export { projectFactory } from './project';
export { projectTreeItemFactory } from './project-tree-item';
export { settingsFactory } from './settings';
export { mainWorktreeFactory, worktreeFactory } from './worktree';
export { worktreeComparisonFactory } from './worktree-comparison';
export { worktreeDetailsFactory } from './worktree-details';

import { appSnapshotFactory } from './app-snapshot';
import { branchCommitFactory } from './branch-commit';
import { branchCommitPageFactory } from './branch-commit-page';
import { diffStatsFactory } from './diff-stats';
import { resetTestFaker } from './faker';
import { pullRequestFactory } from './pull-request';
import { projectFactory } from './project';
import { projectTreeItemFactory } from './project-tree-item';
import { settingsFactory } from './settings';
import { mainWorktreeFactory, worktreeFactory } from './worktree';
import { worktreeComparisonFactory } from './worktree-comparison';
import { worktreeDetailsFactory } from './worktree-details';

const factories = [
  appSnapshotFactory,
  branchCommitFactory,
  branchCommitPageFactory,
  diffStatsFactory,
  pullRequestFactory,
  projectFactory,
  projectTreeItemFactory,
  settingsFactory,
  worktreeFactory,
  mainWorktreeFactory,
  worktreeComparisonFactory,
  worktreeDetailsFactory,
];

export function resetTestDataFactories(): void {
  resetTestFaker();
  for (const factory of factories) factory.rewindSequence();
}
