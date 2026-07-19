import { FolderMinus, LoaderCircle } from 'lucide-react';
import controls from '../../styles/controls.module.css';
import styles from './dialogs.module.css';

export function ProjectRemovalDialog({
  projectName,
  busy,
  onCancel,
  onConfirm,
}: {
  projectName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.modalBackdrop}>
      <div
        className={`${styles.modal} ${styles.projectRemovalModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-removal-title"
      >
        <div className={`${styles.modalIcon} ${styles.projectRemoval}`}>
          <FolderMinus size={19} />
        </div>
        <div className={styles.modalHeading}>
          <span>REMOVE FROM GRAFTER</span>
          <h2 id="project-removal-title">Remove “{projectName}” from Grafter?</h2>
          <p>
            Grafter will remove this project from the sidebar. The repository and its
            worktrees will remain on disk.
          </p>
        </div>
        <div className={styles.modalActions}>
          <button
            className={`${controls.button} ${controls.ghost}`}
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`${controls.button} ${controls.primary}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <FolderMinus size={14} />
            )}
            Remove project
          </button>
        </div>
      </div>
    </div>
  );
}
