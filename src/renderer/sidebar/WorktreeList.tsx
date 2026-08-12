import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import type { Project, Worktree, WorktreeStatus } from '../../shared/contracts';
import { displayWorktreePath } from '../../shared/path-display';
import { filterWorktrees, sortWorktrees } from '../../shared/worktree-list';
import type { WorktreeSortOrder } from '../../shared/worktree-list';
import { PullRequestStateIcon } from '../ui/PullRequestStateIcon';
import { HighlightedText } from '../ui/HighlightedText';
import styles from './sidebar.module.css';

export function WorktreeList({
  homeDirectory,
  project,
  selectedId,
  selectedWorktreeStatus,
  sortOrder,
  filterQuery,
  flat = false,
  onSelect,
  onRemoveWorktree,
}: {
  homeDirectory: string;
  project: Project;
  selectedId: string | undefined;
  selectedWorktreeStatus: WorktreeStatus | undefined;
  sortOrder: WorktreeSortOrder;
  filterQuery: string;
  flat?: boolean;
  onSelect: (id: string) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
}): React.JSX.Element {
  const visibleWorktrees = useMemo(
    () => filterWorktrees(sortWorktrees(project.worktrees, sortOrder), filterQuery),
    [filterQuery, project.worktrees, sortOrder],
  );

  return (
    <div>
      <div
        className={`${styles.branchList} ${flat ? styles.flatWorktreeList : ''}`}
        aria-label={`${project.name} worktrees`}
      >
        {visibleWorktrees.length ? (
          visibleWorktrees.map(({ worktree, displayNameIndexes, branchIndexes }) => (
            <WorktreeRow
              key={worktree.id}
              homeDirectory={homeDirectory}
              mainClonePath={project.path}
              worktree={worktree}
              displayNameIndexes={displayNameIndexes}
              branchIndexes={branchIndexes}
              selected={selectedId === worktree.id}
              status={selectedId === worktree.id ? selectedWorktreeStatus : undefined}
              onSelect={onSelect}
              onRemoveWorktree={onRemoveWorktree}
            />
          ))
        ) : (
          <div className={styles.emptyWorktreeList} role="status">
            No worktrees match “{filterQuery.trim()}”
          </div>
        )}
      </div>
    </div>
  );
}

function WorktreeRow({
  homeDirectory,
  mainClonePath,
  worktree,
  displayNameIndexes,
  branchIndexes,
  selected,
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
  status: WorktreeStatus | undefined;
  onSelect: (id: string) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
}): React.JSX.Element {
  const displayedPath = displayWorktreePath(worktree.path, mainClonePath, homeDirectory);

  return (
    <div
      className={`${styles.treeRow} ${styles.branchRow} ${
        worktree.isMain ? styles.mainWorktreeRow : ''
      } ${selected ? styles.selected : ''}`}
    >
      <button
        className={styles.treeLabel}
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
          <button
            className={styles.dangerAction}
            aria-label={`Remove ${worktree.displayName} worktree`}
            title="Remove worktree"
            onClick={() => onRemoveWorktree(worktree)}
          >
            <Trash2 size={13} />
          </button>
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
