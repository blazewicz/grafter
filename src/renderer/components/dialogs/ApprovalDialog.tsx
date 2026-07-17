import { AlertTriangle, Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { ApprovalRequest } from '../../../shared/contracts';

export function ApprovalDialog({
  request,
  busy,
  onReject,
  onApprove,
}: {
  request: ApprovalRequest;
  busy: boolean;
  onReject: () => void;
  onApprove: () => void;
}): React.JSX.Element {
  return (
    <div className="modal-backdrop">
      <div
        className="modal approval-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
      >
        <div className="modal-icon warning">
          <AlertTriangle size={20} />
        </div>
        <div className="modal-heading">
          <span>APPROVAL REQUIRED</span>
          <h2 id="approval-title">Review command</h2>
          <p>{request.warning}</p>
        </div>
        <div className="approval-command">
          <div>
            <span>COMMAND</span>
            <code>{request.command.displayCommand}</code>
          </div>
          <div>
            <span>WORKING DIRECTORY</span>
            <code>{request.command.cwd}</code>
          </div>
        </div>
        <div className="approval-note">
          <ShieldCheck size={16} />
          <span>
            Approval applies only to this exact command. Any change requires a new review.
          </span>
        </div>
        <div className="modal-actions">
          <button className="button ghost" disabled={busy} onClick={onReject}>
            Don’t run
          </button>
          <button className="button danger" disabled={busy} onClick={onApprove}>
            {busy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}{' '}
            Approve & run
          </button>
        </div>
      </div>
    </div>
  );
}
