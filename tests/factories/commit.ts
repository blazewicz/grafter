import { Factory } from 'fishery';
import type { Commit } from '../../src/shared/contracts';
import { testFaker } from './faker';

export interface CommitTransientParams {
  withAuthorEmail: boolean;
}

export const commitFactory = Factory.define<Commit, CommitTransientParams>(
  ({ transientParams }) => ({
    hash: testFaker.git.commitSha(),
    title: testFaker.git.commitMessage(),
    authorName: testFaker.person.fullName(),
    ...(transientParams.withAuthorEmail === false
      ? {}
      : { authorEmail: testFaker.internet.email() }),
    authoredAt: testFaker.date
      .recent({ days: 30, refDate: '2026-07-25T12:00:00.000Z' })
      .toISOString(),
  }),
);
