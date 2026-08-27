import { GitCommitHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CommitDiffSession } from '../../shared/contracts';
import { api, friendlyError } from '../grafter-api';
import { CopyButton } from '../ui/CopyButton';
import styles from './DiffViewer.module.css';

export function CommitDiffControls({
  session,
  onError,
}: {
  session: CommitDiffSession;
  onError: (message: string) => void;
}): React.JSX.Element {
  const copyResetTimer = useRef<number | undefined>(undefined);
  const [hashCopied, setHashCopied] = useState(false);

  useEffect(
    () => () => {
      if (copyResetTimer.current !== undefined) {
        window.clearTimeout(copyResetTimer.current);
      }
    },
    [],
  );

  const copyCommitHash = (): void => {
    void api
      .copyText(session.commit.hash)
      .then(() => {
        setHashCopied(true);
        if (copyResetTimer.current !== undefined) {
          window.clearTimeout(copyResetTimer.current);
        }
        copyResetTimer.current = window.setTimeout(() => setHashCopied(false), 1600);
      })
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  return (
    <div className={styles.toolbarTitle}>
      <GitCommitHorizontal size={16} />
      <div className={styles.commitToolbarPrimary}>
        <code title={session.commit.hash}>{session.commit.hash.slice(0, 7)}</code>
        <CopyButton
          copied={hashCopied}
          copyLabel="Copy full commit hash"
          copiedLabel="Commit hash copied"
          onCopy={copyCommitHash}
          compact
        />
        <strong title={session.commit.title}>
          {session.commit.title || 'Untitled commit'}
        </strong>
      </div>
    </div>
  );
}
