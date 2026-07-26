import { Factory } from 'fishery';
import type { BranchCommitPage } from '../../src/shared/contracts';
import { branchCommitFactory } from './branch-commit';

interface BranchCommitPageTransientParams {
  count: number;
}

export const branchCommitPageFactory = Factory.define<
  BranchCommitPage,
  BranchCommitPageTransientParams
>(({ params, transientParams }) => {
  const commits =
    params.commits ?? branchCommitFactory.buildList(transientParams.count ?? 1);

  return {
    commits,
    total: params.total ?? commits.length,
    hasMore: params.hasMore ?? false,
  };
});
