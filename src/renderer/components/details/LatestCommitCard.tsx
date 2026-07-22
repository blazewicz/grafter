import { Ellipsis, FileDiff, GitCommitHorizontal, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import type { CommitDetails, Settings } from '../../../shared/contracts';
import { formatDate, formatTime } from '../../date-time';
import { CopyButton } from '../ui/CopyButton';
import styles from './details.module.css';

export function LatestCommitCard({
  commit,
  settings,
  systemLocale,
  copied,
  onCopy,
  opening = false,
  onViewChanges,
}: {
  commit: CommitDetails;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  copied: boolean;
  onCopy: () => void;
  opening?: boolean;
  onViewChanges?: () => void;
}): React.JSX.Element {
  const [bodyOpen, setBodyOpen] = useState(false);
  const bodyId = useId();
  const hasBody = commit.body.trim().length > 0;
  const authorTitle = commit.authorEmail
    ? `${commit.authorName} <${commit.authorEmail}>`
    : commit.authorName;

  return (
    <section className={styles.commitCard} aria-label="HEAD commit">
      <span className={styles.sectionLabel}>HEAD COMMIT</span>
      <div className={styles.commitTitleRow}>
        <GitCommitHorizontal
          className={styles.commitTitleIcon}
          size={16}
          aria-hidden="true"
        />
        <div className={styles.commitTitleCopy}>
          <div className={styles.commitHash}>
            <code title={commit.hash}>{commit.hash.slice(0, 7)}</code>
            <CopyButton
              copied={copied}
              copyLabel="Copy full commit hash"
              copiedLabel="Commit hash copied"
              onCopy={onCopy}
            />
          </div>
          <strong className={styles.commitTitle}>
            {commit.title || 'Untitled commit'}
          </strong>
          {hasBody && (
            <button
              className={styles.commitBodyButton}
              aria-controls={bodyId}
              aria-expanded={bodyOpen}
              aria-label={bodyOpen ? 'Hide commit body' : 'Show commit body'}
              title={bodyOpen ? 'Hide commit body' : 'Show commit body'}
              onClick={() => setBodyOpen((open) => !open)}
            >
              <Ellipsis size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        {onViewChanges && (
          <button
            className={styles.sectionActionButton}
            disabled={opening}
            aria-label={opening ? 'Opening commit changes' : 'View commit changes'}
            title={opening ? 'Opening commit changes' : 'View commit changes'}
            onClick={onViewChanges}
          >
            {opening ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <FileDiff size={14} />
            )}
          </button>
        )}
      </div>
      {hasBody && (
        <div className={styles.commitBody} id={bodyId} hidden={!bodyOpen}>
          {commit.body}
        </div>
      )}
      <div className={styles.commitMeta}>
        <span title={authorTitle}>{commit.authorName}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={commit.authoredAt} title={commit.authoredAt}>
          {formatDate(commit.authoredAt, settings.dateFormat, systemLocale)} at{' '}
          {formatTime(commit.authoredAt, settings.timeFormat, false, systemLocale)}
        </time>
        <span aria-hidden="true">·</span>
        <span>
          {commit.stats.files} {commit.stats.files === 1 ? 'file' : 'files'}
        </span>
        <span aria-hidden="true">·</span>
        <span
          className={styles.commitAdditions}
          aria-label={`${commit.stats.additions} additions`}
        >
          +{commit.stats.additions}
        </span>
        <span
          className={styles.commitDeletions}
          aria-label={`${commit.stats.deletions} deletions`}
        >
          −{commit.stats.deletions}
        </span>
      </div>
    </section>
  );
}
