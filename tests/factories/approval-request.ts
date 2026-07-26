import { Factory } from 'fishery';
import type { ApprovalRequest } from '../../src/shared/contracts';
import { commandRecordFactory } from './command-record';
import { fakeSlug, testFaker } from './faker';

export const approvalRequestFactory = Factory.define<ApprovalRequest>(
  ({ associations }) => ({
    approvalId: testFaker.string.uuid(),
    command:
      associations.command ??
      commandRecordFactory.build(
        {
          args: ['worktree', 'remove', `../${fakeSlug('worktree')}`],
        },
        { transient: { preset: 'awaiting-approval' } },
      ),
    warning: testFaker.lorem.sentence(),
  }),
);
