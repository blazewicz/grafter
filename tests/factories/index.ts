export { approvalRequestFactory } from './approval-request';
export {
  loadingSnapshotFactory,
  repositorySnapshotFactory,
  welcomeSnapshotFactory,
} from './app-snapshot';
export { branchDiffSessionFactory } from './branch-diff-session';
export { commandRecordFactory } from './command-record';
export { commitDetailsFactory } from './commit-details';
export { commitDiffSessionFactory } from './commit-diff-session';
export { commitPageFactory } from './commit-page';
export { commitFactory } from './commit';
export { diffFilePatchFactory } from './diff-file-patch';
export { diffFileSummaryFactory } from './diff-file-summary';
export { diffStatsFactory } from './diff-stats';
export { pullRequestFactory } from './pull-request';
export { projectConfigFactory } from './project-config';
export { projectFactory } from './project';
export { recentRepositoryFactory } from './recent-repository';
export { settingsFactory } from './settings';
export { mainWorktreeFactory, worktreeFactory } from './worktree';
export { worktreeComparisonFactory } from './worktree-comparison';
export { worktreeDetailsFactory } from './worktree-details';

import { approvalRequestFactory } from './approval-request';
import {
  loadingSnapshotFactory,
  repositorySnapshotFactory,
  welcomeSnapshotFactory,
} from './app-snapshot';
import { branchDiffSessionFactory } from './branch-diff-session';
import { commandRecordFactory } from './command-record';
import { commitDetailsFactory } from './commit-details';
import { commitDiffSessionFactory } from './commit-diff-session';
import { commitPageFactory } from './commit-page';
import { commitFactory } from './commit';
import { diffFilePatchFactory } from './diff-file-patch';
import { diffFileSummaryFactory } from './diff-file-summary';
import { diffStatsFactory } from './diff-stats';
import { resetTestFaker } from './faker';
import { pullRequestFactory } from './pull-request';
import { projectConfigFactory } from './project-config';
import { projectFactory } from './project';
import { recentRepositoryFactory } from './recent-repository';
import { settingsFactory } from './settings';
import { mainWorktreeFactory, worktreeFactory } from './worktree';
import { worktreeComparisonFactory } from './worktree-comparison';
import { worktreeDetailsFactory } from './worktree-details';

const factories = [
  approvalRequestFactory,
  loadingSnapshotFactory,
  repositorySnapshotFactory,
  welcomeSnapshotFactory,
  branchDiffSessionFactory,
  commandRecordFactory,
  commitDetailsFactory,
  commitDiffSessionFactory,
  commitPageFactory,
  commitFactory,
  diffFilePatchFactory,
  diffFileSummaryFactory,
  diffStatsFactory,
  pullRequestFactory,
  projectConfigFactory,
  projectFactory,
  recentRepositoryFactory,
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
