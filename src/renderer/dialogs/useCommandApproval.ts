import { useState } from 'react';
import type { AppSnapshot, GrafterApi, ApprovalRequest } from '../../shared/contracts';

export function useCommandApproval(
  api: Pick<GrafterApi, 'approveCommand' | 'rejectCommand'>,
  run: <T>(action: () => Promise<T>, onSuccess?: (result: T) => void) => Promise<void>,
  applySnapshot: (next: AppSnapshot) => void,
): {
  approval: ApprovalRequest | undefined;
  requestApproval: (next: ApprovalRequest) => void;
  resolveApproval: (decision: 'approve' | 'reject') => void;
} {
  const [approval, setApproval] = useState<ApprovalRequest>();

  const resolveApproval = (decision: 'approve' | 'reject'): void => {
    if (!approval) return;
    const approvalId = approval.approvalId;

    // Approval IDs are single-use. Release the dialog before invoking the main
    // process so an expired token or failed command cannot leave a stale modal
    // blocking the interface.
    setApproval(undefined);
    void run(
      () =>
        decision === 'approve'
          ? api.approveCommand(approvalId)
          : api.rejectCommand(approvalId),
      applySnapshot,
    );
  };

  return {
    approval,
    requestApproval: setApproval,
    resolveApproval,
  };
}
