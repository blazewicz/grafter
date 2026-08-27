import type { DiffSession } from '../../shared/contracts';
import { BranchDiffControls } from './BranchDiffControls';
import { CommitDiffControls } from './CommitDiffControls';
import styles from './DiffViewer.module.css';

export function DiffViewerToolbar({
  session,
  onSessionChange,
  onError,
}: {
  session: DiffSession;
  onSessionChange: (session: DiffSession) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  return (
    <header className={styles.toolbar} data-kind={session.kind}>
      {session.kind === 'branch' ? (
        <BranchDiffControls
          session={session}
          onSessionChange={onSessionChange}
          onError={onError}
        />
      ) : (
        <CommitDiffControls session={session} onError={onError} />
      )}
      <div className={styles.totalStats} aria-label="Diff totals">
        <span>
          {session.stats.files} {session.stats.files === 1 ? 'file' : 'files'}
        </span>
        <strong className={styles.additions}>+{session.stats.additions}</strong>
        <strong className={styles.deletions}>−{session.stats.deletions}</strong>
      </div>
    </header>
  );
}
