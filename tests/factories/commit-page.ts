import { Factory } from 'fishery';
import type { CommitPage } from '../../src/shared/contracts';
import { commitFactory } from './commit';

interface CommitPageTransientParams {
  count: number;
}

export const commitPageFactory = Factory.define<CommitPage, CommitPageTransientParams>(
  ({ params, transientParams }) => {
    const commits = params.commits ?? commitFactory.buildList(transientParams.count ?? 1);

    return {
      commits,
      total: params.total ?? commits.length,
      hasMore: params.hasMore ?? false,
    };
  },
);
