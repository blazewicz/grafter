import type { BranchCommit, BranchCommitPage } from '../../../src/shared/contracts';
import { branchCommitFactory, branchCommitPageFactory } from '../../factories';

export interface CommitHistoryCardScenario {
  newest: BranchCommit;
  earlier: BranchCommit;
  untitled: BranchCommit;
  emptyPage: BranchCommitPage;
  singlePage: BranchCommitPage;
  completePage: BranchCommitPage;
  pageWithMore: BranchCommitPage;
  untitledPage: BranchCommitPage;
  firstPage: BranchCommitPage;
  nextPage: BranchCommitPage;
}

export function buildCommitHistoryCardScenario(): CommitHistoryCardScenario {
  const newest = branchCommitFactory.build();
  const earlier = branchCommitFactory.build(
    {},
    { transient: { withAuthorEmail: false } },
  );
  const untitled = branchCommitFactory.build({ title: '' });

  return {
    newest,
    earlier,
    untitled,
    emptyPage: branchCommitPageFactory.build({
      commits: [],
      total: 0,
      hasMore: false,
    }),
    singlePage: branchCommitPageFactory.build({
      commits: [newest],
      total: 1,
      hasMore: false,
    }),
    completePage: branchCommitPageFactory.build({
      commits: [newest, earlier],
      total: 2,
      hasMore: false,
    }),
    pageWithMore: branchCommitPageFactory.build({
      commits: [newest, earlier],
      total: 3,
      hasMore: true,
    }),
    untitledPage: branchCommitPageFactory.build({
      commits: [untitled],
      total: 1,
      hasMore: false,
    }),
    firstPage: branchCommitPageFactory.build({
      commits: [newest],
      total: 2,
      hasMore: true,
    }),
    nextPage: branchCommitPageFactory.build({
      commits: [earlier],
      total: 2,
      hasMore: false,
    }),
  };
}
