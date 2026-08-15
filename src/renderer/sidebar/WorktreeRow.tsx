import { Trash2 } from 'lucide-react';
import type { Worktree, WorktreeStatus } from '../../shared/contracts';
import { displayWorktreePath } from '../../shared/path-display';
import { HighlightedText } from '../ui/HighlightedText';
import { PullRequestStateIcon } from '../ui/PullRequestStateIcon';
import { QuickTooltip } from '../ui/QuickTooltip';
import styles from './sidebar.module.css';

export function worktreeRowId(worktreeId: string): string {
  return `worktree-row-${worktreeId}`;
}

export function WorktreeRow({
  homeDirectory,
  mainClonePath,
  worktree,
  displayNameIndexes,
  branchIndexes,
  selected,
  highlighted,
  tabbable,
  status,
  onSelect,
  onRemoveWorktree,
}: {
  homeDirectory: string;
  mainClonePath: string;
  worktree: Worktree;
  displayNameIndexes: readonly number[];
  branchIndexes: readonly number[];
  selected: boolean;
  highlighted: boolean;
  tabbable: boolean;
  status: WorktreeStatus | undefined;
  onSelect: (id: string) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
}): React.JSX.Element {
  const displayedPath = displayWorktreePath(worktree.path, mainClonePath, homeDirectory);

  return (
    <div
      className={`${styles.treeRow} ${styles.branchRow} ${
        worktree.isMain ? styles.mainWorktreeRow : ''
      } ${selected ? styles.selected : ''} ${highlighted ? styles.highlighted : ''}`}
    >
      <button
        type="button"
        id={worktreeRowId(worktree.id)}
        className={styles.treeLabel}
        role="option"
        tabIndex={tabbable ? 0 : -1}
        aria-selected={highlighted}
        aria-current={selected ? 'page' : undefined}
        aria-label={
          worktree.isMain
            ? `Main worktree, checked out branch ${worktree.branch}`
            : `${worktree.displayName}, checked out branch ${worktree.branch}`
        }
        onClick={() => onSelect(worktree.id)}
        onPointerUp={(event) => event.currentTarget.blur()}
      >
        <span className={styles.worktreeCopy}>
          <span className={styles.worktreeTopLine}>
            <span
              className={styles.worktreeNameWrap}
              title={worktree.isMain ? `Main worktree · ${displayedPath}` : displayedPath}
              data-worktree-path={worktree.path}
            >
              <span className={styles.worktreeName}>
                <HighlightedText
                  text={worktree.displayName}
                  indexes={displayNameIndexes}
                />
              </span>
            </span>
            <WorktreeBadges status={status} worktree={worktree} />
          </span>
          <span
            className={styles.branchNameWrap}
            title={worktree.branch}
            data-branch-name={worktree.branch}
          >
            <span className={styles.branchName}>
              <HighlightedText text={worktree.branch} indexes={branchIndexes} />
            </span>
          </span>
        </span>
      </button>
      {!worktree.isMain && (
        <div className={styles.rowActions}>
          <QuickTooltip label="Remove worktree" showDelay={0} align="right">
            <button
              className={styles.dangerAction}
              tabIndex={tabbable ? 0 : -1}
              aria-label={`Remove ${worktree.displayName} worktree`}
              onClick={() => onRemoveWorktree(worktree)}
            >
              <Trash2 size={13} />
            </button>
          </QuickTooltip>
        </div>
      )}
    </div>
  );
}

function WorktreeBadges({
  status,
  worktree,
}: {
  status: WorktreeStatus | undefined;
  worktree: Worktree;
}): React.JSX.Element {
  if (!(status === 'dirty' || worktree.pullRequest)) return <></>;

  return (
    <span className={styles.worktreeBadges} aria-label="Worktree badges">
      {status === 'dirty' && (
        <span
          className={styles.dirtyBadge}
          role="img"
          aria-label="Dirty worktree"
          title="Uncommitted changes"
        />
      )}
      {worktree.pullRequest && (
        <PullRequestStateIcon
          className={styles.pullRequestBadge}
          state={worktree.pullRequest.state}
          size={13}
        />
      )}
    </span>
  );
}
