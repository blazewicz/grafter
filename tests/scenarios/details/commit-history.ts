import type { Commit, CommitPage } from '../../../src/shared/contracts';
import { commitFactory, commitPageFactory } from '../../factories';

export interface CommitHistoryCardScenario {
  newest: Commit;
  earlier: Commit;
  untitled: Commit;
  emptyPage: CommitPage;
  singlePage: CommitPage;
  completePage: CommitPage;
  pageWithMore: CommitPage;
  untitledPage: CommitPage;
  firstPage: CommitPage;
  nextPage: CommitPage;
}

export function buildCommitHistoryCardScenario(): CommitHistoryCardScenario {
  const newest = commitFactory.build();
  const earlier = commitFactory.build({}, { transient: { withAuthorEmail: false } });
  const untitled = commitFactory.build({ title: '' });

  return {
    newest,
    earlier,
    untitled,
    emptyPage: commitPageFactory.build({
      commits: [],
      total: 0,
      hasMore: false,
    }),
    singlePage: commitPageFactory.build({
      commits: [newest],
      total: 1,
      hasMore: false,
    }),
    completePage: commitPageFactory.build({
      commits: [newest, earlier],
      total: 2,
      hasMore: false,
    }),
    pageWithMore: commitPageFactory.build({
      commits: [newest, earlier],
      total: 3,
      hasMore: true,
    }),
    untitledPage: commitPageFactory.build({
      commits: [untitled],
      total: 1,
      hasMore: false,
    }),
    firstPage: commitPageFactory.build({
      commits: [newest],
      total: 2,
      hasMore: true,
    }),
    nextPage: commitPageFactory.build({
      commits: [earlier],
      total: 2,
      hasMore: false,
    }),
  };
}
