import { Factory } from 'fishery';
import type { CommitDetails } from '../../src/shared/contracts';
import { diffStatsFactory } from './diff-stats';
import { testFaker } from './faker';

export const commitDetailsFactory = Factory.define<CommitDetails>(() => ({
  hash: testFaker.git.commitSha(),
  title: testFaker.git.commitMessage(),
  body: testFaker.lorem.paragraph(),
  authorName: testFaker.person.fullName(),
  authoredAt: testFaker.date
    .recent({ days: 30, refDate: '2026-07-25T12:00:00.000Z' })
    .toISOString(),
  stats: diffStatsFactory.build(),
}));
