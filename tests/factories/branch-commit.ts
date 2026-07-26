import { Factory } from 'fishery';
import type { BranchCommit } from '../../src/shared/contracts';
import { testFaker } from './faker';

interface BranchCommitTransientParams {
  withAuthorEmail: boolean;
}

export const branchCommitFactory = Factory.define<
  BranchCommit,
  BranchCommitTransientParams
>(({ transientParams }) => ({
  hash: testFaker.git.commitSha(),
  title: testFaker.git.commitMessage(),
  authorName: testFaker.person.fullName(),
  ...(transientParams.withAuthorEmail === false
    ? {}
    : { authorEmail: testFaker.internet.email() }),
  authoredAt: testFaker.date
    .recent({ days: 30, refDate: '2026-07-25T12:00:00.000Z' })
    .toISOString(),
}));
