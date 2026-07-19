import { Check, Copy, Ellipsis, GitCommitHorizontal } from 'lucide-react';
import { useId, useState } from 'react';
import type { CommitDetails, Settings } from '../../../shared/contracts';
import { formatDate, formatTime } from '../../date-time';
import styles from './details.module.css';

export function LatestCommitCard({
  commit,
  settings,
  systemLocale,
  copied,
  onCopy,
}: {
  commit: CommitDetails;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  copied: boolean;
  onCopy: () => void;
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
        <div className={styles.commitHash}>
          <code title={commit.hash}>{commit.hash.slice(0, 7)}</code>
          <button
            className={styles.copyTextButton}
            aria-label={copied ? 'Commit hash copied' : 'Copy full commit hash'}
            title={copied ? 'Commit hash copied' : 'Copy full commit hash'}
            onClick={onCopy}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
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
