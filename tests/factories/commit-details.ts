import { Factory } from 'fishery';
import type { CommitDetails } from '../../src/shared/contracts';
import { commitFactory, type CommitTransientParams } from './commit';
import { diffStatsFactory } from './diff-stats';
import { testFaker } from './faker';

export const commitDetailsFactory = Factory.define<CommitDetails, CommitTransientParams>(
  ({ params, transientParams }) => {
    const { body, stats, ...commitParams } = params;
    const commit = commitFactory.build(commitParams, {
      transient: transientParams,
    });

    return {
      ...commit,
      body: body ?? testFaker.lorem.paragraph(),
      stats: stats ? diffStatsFactory.build(stats) : diffStatsFactory.build(),
    };
  },
);
