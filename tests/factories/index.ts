export { approvalRequestFactory } from './approval-request';
export { appSnapshotFactory } from './app-snapshot';
export { branchDiffSessionFactory } from './branch-diff-session';
export { branchCommitFactory } from './branch-commit';
export { branchCommitPageFactory } from './branch-commit-page';
export { commandRecordFactory } from './command-record';
export { commitDetailsFactory } from './commit-details';
export { commitDiffSessionFactory } from './commit-diff-session';
export { diffFilePatchFactory } from './diff-file-patch';
export { diffFileSummaryFactory } from './diff-file-summary';
export { diffStatsFactory } from './diff-stats';
export { pullRequestFactory } from './pull-request';
export { projectConfigFactory } from './project-config';
export { projectFactory } from './project';
export { settingsFactory } from './settings';
export { mainWorktreeFactory, worktreeFactory } from './worktree';
export { worktreeComparisonFactory } from './worktree-comparison';
export { worktreeDetailsFactory } from './worktree-details';

import { approvalRequestFactory } from './approval-request';
import { appSnapshotFactory } from './app-snapshot';
import { branchDiffSessionFactory } from './branch-diff-session';
import { branchCommitFactory } from './branch-commit';
import { branchCommitPageFactory } from './branch-commit-page';
import { commandRecordFactory } from './command-record';
import { commitDetailsFactory } from './commit-details';
import { commitDiffSessionFactory } from './commit-diff-session';
import { diffFilePatchFactory } from './diff-file-patch';
import { diffFileSummaryFactory } from './diff-file-summary';
import { diffStatsFactory } from './diff-stats';
import { resetTestFaker } from './faker';
import { pullRequestFactory } from './pull-request';
import { projectConfigFactory } from './project-config';
import { projectFactory } from './project';
import { settingsFactory } from './settings';
import { mainWorktreeFactory, worktreeFactory } from './worktree';
import { worktreeComparisonFactory } from './worktree-comparison';
import { worktreeDetailsFactory } from './worktree-details';

const factories = [
  approvalRequestFactory,
  appSnapshotFactory,
  branchDiffSessionFactory,
  branchCommitFactory,
  branchCommitPageFactory,
  commandRecordFactory,
  commitDetailsFactory,
  commitDiffSessionFactory,
  diffFilePatchFactory,
  diffFileSummaryFactory,
  diffStatsFactory,
  pullRequestFactory,
  projectConfigFactory,
  projectFactory,
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
