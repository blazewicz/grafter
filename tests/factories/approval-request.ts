import { Factory } from 'fishery';
import type { ApprovalRequest, CommandRecord } from '../../src/shared/contracts';
import { commandRecordFactory } from './command-record';
import { fakeSlug, testFaker } from './faker';

interface ApprovalRequestTransientParams {
  commandOverrides: Partial<CommandRecord>;
}

export const approvalRequestFactory = Factory.define<
  ApprovalRequest,
  ApprovalRequestTransientParams
>(({ associations, transientParams }) => ({
  approvalId: testFaker.string.uuid(),
  command:
    associations.command ??
    commandRecordFactory.build(
      {
        args: ['worktree', 'remove', `../${fakeSlug('worktree')}`],
        ...transientParams.commandOverrides,
      },
      { transient: { preset: 'awaiting-approval' } },
    ),
  warning: testFaker.lorem.sentence(),
}));
