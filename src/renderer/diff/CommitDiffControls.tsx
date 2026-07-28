import { ChevronDown, GitCommitHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CommitDiffSession, Settings } from '../../shared/contracts';
import { formatDate, formatTime } from '../date-time';
import { api, friendlyError } from '../grafter-api';
import { CopyButton } from '../ui/CopyButton';
import styles from './DiffViewer.module.css';

export function CommitDiffControls({
  session,
  settings,
  systemLocale,
  onError,
}: {
  session: CommitDiffSession;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  onError: (message: string) => void;
}): React.JSX.Element {
  const controlsRef = useRef<HTMLDivElement>(null);
  const copyResetTimer = useRef<number | undefined>(undefined);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hashCopied, setHashCopied] = useState(false);

  useEffect(() => {
    if (!detailsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setDetailsOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [detailsOpen]);

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
      <div
        className={styles.commitToolbarCopy}
        ref={controlsRef}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !detailsOpen) return;
          event.preventDefault();
          event.stopPropagation();
          setDetailsOpen(false);
        }}
      >
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
        <div className={styles.commitToolbarMeta}>
          <span>{session.commit.authorName}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={session.commit.authoredAt} title={session.commit.authoredAt}>
            {formatDate(session.commit.authoredAt, settings.dateFormat, systemLocale)} at{' '}
            {formatTime(
              session.commit.authoredAt,
              settings.timeFormat,
              false,
              systemLocale,
            )}
          </time>
          <button
            className={styles.commitDetailsButton}
            aria-controls={`commit-details-${session.id}`}
            aria-expanded={detailsOpen}
            aria-label={detailsOpen ? 'Hide commit details' : 'Show commit details'}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            Details
            <ChevronDown size={10} />
          </button>
        </div>
        {detailsOpen && <CommitDetailsPopover session={session} />}
      </div>
    </div>
  );
}

function CommitDetailsPopover({
  session,
}: {
  session: CommitDiffSession;
}): React.JSX.Element {
  const author = session.commit.authorEmail
    ? `${session.commit.authorName} <${session.commit.authorEmail}>`
    : session.commit.authorName;
  const comparison = session.parentShas.length
    ? `Compared with first parent ${session.parentShas[0]?.slice(0, 7)}${
        session.parentShas.length > 1 ? ` · ${session.parentShas.length} parents` : ''
      }`
    : 'Root commit · compared with the empty tree';

  return (
    <section
      className={styles.commitDetailsPopover}
      id={`commit-details-${session.id}`}
      aria-label="Commit details"
    >
      <div className={styles.commitDetailsIdentity}>
        <span title={author}>{author}</span>
        <code>{session.commit.hash}</code>
        <span>{comparison}</span>
      </div>
      {session.commit.body.trim() ? (
        <div className={styles.commitMessage}>{session.commit.body}</div>
      ) : (
        <div className={styles.commitMessageEmpty}>No additional commit message.</div>
      )}
    </section>
  );
}
