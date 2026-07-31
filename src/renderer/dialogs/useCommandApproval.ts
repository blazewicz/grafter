import { useRef, useState } from 'react';
import type { AppSnapshot, GrafterApi, ApprovalRequest } from '../../shared/contracts';

export function useCommandApproval(
  api: Pick<GrafterApi, 'approveCommand' | 'rejectCommand'>,
  run: <T>(action: () => Promise<T>, onSuccess?: (result: T) => void) => Promise<void>,
  applySnapshot: (next: AppSnapshot) => void,
): {
  approval: ApprovalRequest | undefined;
  enqueueApproval: (next: ApprovalRequest) => void;
  resolveApproval: (decision: 'approve' | 'reject') => void;
} {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [resolving, setResolving] = useState(false);
  const resolvingApprovalId = useRef<string | undefined>(undefined);
  const approval = resolving ? undefined : approvals[0];

  const enqueueApproval = (next: ApprovalRequest): void => {
    setApprovals((current) => [...current, next]);
  };

  const resolveApproval = (decision: 'approve' | 'reject'): void => {
    if (!approval || resolvingApprovalId.current) return;
    const approvalId = approval.approvalId;
    resolvingApprovalId.current = approvalId;
    setResolving(true);

    // Approval IDs are single-use. Release the dialog before invoking the main
    // process so an expired token or failed command cannot leave a stale modal
    // blocking the interface.
    setApprovals((current) => current.slice(1));
    const releaseResolution = (): void => {
      if (resolvingApprovalId.current !== approvalId) return;
      resolvingApprovalId.current = undefined;
      setResolving(false);
    };
    void run(
      () =>
        decision === 'approve'
          ? api.approveCommand(approvalId)
          : api.rejectCommand(approvalId),
      applySnapshot,
    ).then(releaseResolution, releaseResolution);
  };

  return {
    approval,
    enqueueApproval,
    resolveApproval,
  };
}
