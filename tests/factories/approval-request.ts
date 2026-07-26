import { Factory } from 'fishery';
import type { ApprovalRequest } from '../../src/shared/contracts';
import { commandRecordFactory } from './command-record';
import { fakeSlug, testFaker } from './faker';

type ApprovalRequestParams = Partial<ApprovalRequest>;

export const approvalRequestFactory = Factory.define<
  ApprovalRequest,
  Record<never, never>,
  ApprovalRequest,
  ApprovalRequestParams
>(({ associations, params }) => ({
  approvalId: params.approvalId ?? testFaker.string.uuid(),
  command:
    associations.command ??
    commandRecordFactory.build({
      args: ['worktree', 'remove', `../${fakeSlug('worktree')}`],
      isReadOnly: false,
      status: 'awaiting-approval',
      requiresApproval: true,
    }),
  warning: params.warning ?? testFaker.lorem.sentence(),
}));
