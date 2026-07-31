import { useRef, useState } from 'react';
import type { AppSnapshot, GrafterApi, ApprovalRequest } from '../../shared/contracts';

export function useCommandApproval(
  api: Pick<GrafterApi, 'approveCommand' | 'rejectCommand'>,
  run: <T>(action: () => Promise<T>, onSuccess?: (result: T) => void) => Promise<void>,
  applySnapshot: (next: AppSnapshot) => void,
): {
  approval: ApprovalRequest | undefined;
  approvalRunning: boolean;
  enqueueApproval: (next: ApprovalRequest) => void;
  resolveApproval: (decision: 'approve' | 'reject') => void;
} {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [resolvingDecision, setResolvingDecision] = useState<'approve' | 'reject'>();
  const resolvingApprovalId = useRef<string | undefined>(undefined);
  const approval = resolvingDecision === 'reject' ? undefined : approvals[0];
  const approvalRunning = resolvingDecision === 'approve';

  const enqueueApproval = (next: ApprovalRequest): void => {
    setApprovals((current) => [...current, next]);
  };

  const resolveApproval = (decision: 'approve' | 'reject'): void => {
    if (!approval || resolvingApprovalId.current) return;
    const approvalId = approval.approvalId;
    resolvingApprovalId.current = approvalId;
    setResolvingDecision(decision);

    // Keep approved commands visible while they execute so the dialog can show
    // progress. Rejections disappear immediately, but the next queued request
    // waits until the current decision settles.
    const releaseResolution = (): void => {
      if (resolvingApprovalId.current !== approvalId) return;
      resolvingApprovalId.current = undefined;
      setApprovals((current) => current.slice(1));
      setResolvingDecision(undefined);
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
    approvalRunning,
    enqueueApproval,
    resolveApproval,
  };
}
