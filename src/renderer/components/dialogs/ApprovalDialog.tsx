import { AlertTriangle, Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { ApprovalRequest } from '../../../shared/contracts';
import { collapseHomePath } from '../../../shared/path-display';
import controls from '../../styles/controls.module.css';
import styles from './dialogs.module.css';

export function ApprovalDialog({
  homeDirectory,
  request,
  busy,
  onReject,
  onApprove,
}: {
  homeDirectory: string;
  request: ApprovalRequest;
  busy: boolean;
  onReject: () => void;
  onApprove: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.modalBackdrop}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
      >
        <div className={`${styles.modalIcon} ${styles.warning}`}>
          <AlertTriangle size={20} />
        </div>
        <div className={styles.modalHeading}>
          <span>APPROVAL REQUIRED</span>
          <h2 id="approval-title">Review command</h2>
          <p>{request.warning}</p>
        </div>
        <div className={styles.approvalCommand}>
          <div>
            <span>COMMAND</span>
            <code>{request.command.displayCommand}</code>
          </div>
          <div>
            <span>WORKING DIRECTORY</span>
            <code>{collapseHomePath(request.command.cwd, homeDirectory)}</code>
          </div>
        </div>
        <div className={styles.approvalNote}>
          <ShieldCheck size={16} />
          <span>
            Approval applies only to this exact command. Any change requires a new review.
          </span>
        </div>
        <div className={styles.modalActions}>
          <button
            className={`${controls.button} ${controls.ghost}`}
            disabled={busy}
            onClick={onReject}
          >
            Don’t run
          </button>
          <button
            className={`${controls.button} ${controls.danger}`}
            disabled={busy}
            onClick={onApprove}
          >
            {busy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}{' '}
            Approve & run
          </button>
        </div>
      </div>
    </div>
  );
}
