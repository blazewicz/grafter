import type { DeepPartial } from 'fishery';
import type { BranchCommit, BranchCommitPage } from '../../../src/shared/contracts';
import { branchCommitFactory, branchCommitPageFactory } from '../../factories';

interface CommitHistoryScenarioOptions {
  count?: number;
  commits?: DeepPartial<BranchCommit>[];
  page?: DeepPartial<Omit<BranchCommitPage, 'commits'>>;
}

export interface CommitHistoryScenario {
  commits: BranchCommit[];
  page: BranchCommitPage;
}

export function buildCommitHistoryScenario(
  options: CommitHistoryScenarioOptions = {},
): CommitHistoryScenario {
  const commits = options.commits
    ? options.commits.map((commit) => branchCommitFactory.build(commit))
    : branchCommitFactory.buildList(options.count ?? 2);
  const page = branchCommitPageFactory.build(
    {
      commits,
      ...options.page,
    },
    { transient: { count: commits.length } },
  );

  return { commits, page };
}
