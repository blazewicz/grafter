import { FileDiff, GitCommitHorizontal, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BranchCommit, BranchCommitPage, Settings } from '../../../shared/contracts';
import { formatDate, formatTime } from '../../date-time';
import { api, friendlyError } from '../../grafter-api';
import { CopyButton } from '../ui/CopyButton';
import styles from './details.module.css';

const initialCommitLimit = 5;
const additionalCommitLimit = 25;

export interface CommitHistoryState extends BranchCommitPage {
  loadingMore: boolean;
}

export function appendCommitPage(
  current: CommitHistoryState,
  page: BranchCommitPage,
): CommitHistoryState {
  return {
    commits: [...current.commits, ...page.commits],
    total: page.total,
    hasMore: page.hasMore,
    loadingMore: false,
  };
}

export function CommitHistoryCard({
  worktreeId,
  targetBranch,
  settings,
  systemLocale,
  copiedText,
  opening,
  onCopy,
  onViewChanges,
  onError,
}: {
  worktreeId: string;
  targetBranch: string;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  copiedText: string | undefined;
  opening: boolean;
  onCopy: (text: string) => void;
  onViewChanges?: (commitHash: string) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [history, setHistory] = useState<CommitHistoryState>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .listBranchCommits({
        worktreeId,
        targetBranch,
        offset: 0,
        limit: initialCommitLimit,
      })
      .then((page) => {
        if (active) {
          setFailed(false);
          setHistory({ ...page, loadingMore: false });
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setFailed(true);
          onError(friendlyError(caught));
        }
      });
    return () => {
      active = false;
    };
  }, [onError, targetBranch, worktreeId]);

  const loadMore = async (): Promise<void> => {
    if (!history || history.loadingMore) return;
    setHistory({ ...history, loadingMore: true });
    try {
      const page = await api.listBranchCommits({
        worktreeId,
        targetBranch,
        offset: history.commits.length,
        limit: additionalCommitLimit,
      });
      setHistory((current) => (current ? appendCommitPage(current, page) : current));
    } catch (caught) {
      setHistory((current) => (current ? { ...current, loadingMore: false } : current));
      onError(friendlyError(caught));
    }
  };

  return (
    <CommitHistoryCardContent
      history={history}
      failed={failed}
      settings={settings}
      systemLocale={systemLocale}
      copiedText={copiedText}
      opening={opening}
      onCopy={onCopy}
      {...(onViewChanges ? { onViewChanges } : {})}
      onLoadMore={() => void loadMore()}
    />
  );
}

export function CommitHistoryCardContent({
  history,
  failed,
  settings,
  systemLocale,
  copiedText,
  opening,
  onCopy,
  onViewChanges,
  onLoadMore,
}: {
  history: CommitHistoryState | undefined;
  failed: boolean;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  copiedText: string | undefined;
  opening: boolean;
  onCopy: (text: string) => void;
  onViewChanges?: (commitHash: string) => void;
  onLoadMore: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.commitHistoryCard} aria-label="Commits to merge">
      <div className={styles.commitHistoryHeader}>
        <span className={styles.sectionLabel}>COMMITS</span>
        {history && (
          <span className={styles.commitHistoryCount}>
            {history.total} {history.total === 1 ? 'commit' : 'commits'}
          </span>
        )}
      </div>
      {failed ? (
        <div className={styles.commitHistoryEmpty}>Could not load commits.</div>
      ) : !history ? (
        <div className={styles.commitHistoryLoading}>
          <LoaderCircle className="spin" size={13} /> Loading commits…
        </div>
      ) : history.total === 0 ? (
        <div className={styles.commitHistoryEmpty}>No commits to merge.</div>
      ) : (
        <>
          <div className={styles.commitHistoryList}>
            {history.commits.map((commit) => (
              <CommitRow
                key={commit.hash}
                commit={commit}
                settings={settings}
                systemLocale={systemLocale}
                copied={copiedText === commit.hash}
                opening={opening}
                onCopy={() => onCopy(commit.hash)}
                {...(onViewChanges
                  ? { onViewChanges: () => onViewChanges(commit.hash) }
                  : {})}
              />
            ))}
          </div>
          {history.hasMore && (
            <button
              className={styles.commitHistoryMore}
              disabled={history.loadingMore}
              onClick={onLoadMore}
            >
              {history.loadingMore && <LoaderCircle className="spin" size={12} />}
              {history.loadingMore ? 'Loading…' : 'Show more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CommitRow({
  commit,
  settings,
  systemLocale,
  copied,
  opening,
  onCopy,
  onViewChanges,
}: {
  commit: BranchCommit;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  copied: boolean;
  opening: boolean;
  onCopy: () => void;
  onViewChanges?: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.commitHistoryRow}>
      <GitCommitHorizontal size={13} aria-hidden="true" />
      <code title={commit.hash}>{commit.hash.slice(0, 7)}</code>
      <CopyButton
        copied={copied}
        copyLabel={`Copy ${commit.hash} commit hash`}
        copiedLabel="Commit hash copied"
        onCopy={onCopy}
        className={styles.commitHistoryCopyButton}
      />
      <strong title={commit.title}>{commit.title || 'Untitled commit'}</strong>
      <span className={styles.commitHistoryAuthor} title={commit.authorName}>
        {commit.authorName}
      </span>
      <time dateTime={commit.authoredAt} title={commit.authoredAt}>
        {formatDate(commit.authoredAt, settings.dateFormat, systemLocale)} at{' '}
        {formatTime(commit.authoredAt, settings.timeFormat, false, systemLocale)}
      </time>
      {onViewChanges && (
        <button
          className={styles.commitHistoryDiffButton}
          disabled={opening}
          aria-label={`View changes in ${commit.hash.slice(0, 7)}`}
          title="View commit changes"
          onClick={onViewChanges}
        >
          <FileDiff size={13} />
        </button>
      )}
    </div>
  );
}
