import { X } from 'lucide-react';
import type { DiffSession, Settings } from '../../../shared/contracts';
import { BranchDiffControls } from './BranchDiffControls';
import { CommitDiffControls } from './CommitDiffControls';
import styles from './DiffViewer.module.css';

export function DiffViewerToolbar({
  session,
  settings,
  systemLocale,
  onSessionChange,
  onClose,
  onError,
}: {
  session: DiffSession;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  onSessionChange: (session: DiffSession) => void;
  onClose: () => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  return (
    <header className={styles.toolbar}>
      {session.kind === 'branch' ? (
        <BranchDiffControls
          session={session}
          onSessionChange={onSessionChange}
          onError={onError}
        />
      ) : (
        <CommitDiffControls
          session={session}
          settings={settings}
          systemLocale={systemLocale}
          onError={onError}
        />
      )}
      <div className={styles.totalStats} aria-label="Diff totals">
        <span>
          {session.stats.files} {session.stats.files === 1 ? 'file' : 'files'}
        </span>
        <strong className={styles.additions}>+{session.stats.additions}</strong>
        <strong className={styles.deletions}>−{session.stats.deletions}</strong>
      </div>
      <button
        className={styles.closeButton}
        aria-label="Close diff viewer"
        title="Close diff viewer"
        autoFocus
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </header>
  );
}
