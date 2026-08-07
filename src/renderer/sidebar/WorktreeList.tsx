import { FolderGit2, FolderRoot, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import type {
  GrafterApi,
  Project,
  Worktree,
  WorktreeStatus,
} from '../../shared/contracts';
import { displayWorktreePath } from '../../shared/path-display';
import { sortWorktrees } from '../../shared/worktree-list';
import { PullRequestStateIcon } from '../ui/PullRequestStateIcon';
import { NewWorktreeForm } from './NewWorktreeForm';
import { SidebarTooltip } from './SidebarTooltip';
import styles from './sidebar.module.css';

export function WorktreeList({
  homeDirectory,
  project,
  selectedId,
  selectedWorktreeStatus,
  adding,
  flat = false,
  onSelect,
  onCancelAdd,
  onCreated,
  onRemoveWorktree,
  onError,
}: {
  homeDirectory: string;
  project: Project;
  selectedId: string | undefined;
  selectedWorktreeStatus: WorktreeStatus | undefined;
  adding: boolean;
  flat?: boolean;
  onSelect: (id: string) => void;
  onCancelAdd: () => void;
  onCreated: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const sortedWorktrees = useMemo(
    () => sortWorktrees(project.worktrees),
    [project.worktrees],
  );

  return (
    <div>
      <div
        className={`${styles.branchList} ${flat ? styles.flatWorktreeList : ''}`}
        aria-label={`${project.name} worktrees`}
      >
        {sortedWorktrees.map((worktree) => (
          <WorktreeRow
            key={worktree.id}
            homeDirectory={homeDirectory}
            mainClonePath={project.path}
            worktree={worktree}
            selected={selectedId === worktree.id}
            status={selectedId === worktree.id ? selectedWorktreeStatus : undefined}
            onSelect={onSelect}
            onRemoveWorktree={onRemoveWorktree}
          />
        ))}
      </div>
      {adding && (
        <NewWorktreeForm
          project={project}
          onCancel={onCancelAdd}
          onCreated={onCreated}
          onError={onError}
        />
      )}
    </div>
  );
}

function WorktreeRow({
  homeDirectory,
  mainClonePath,
  worktree,
  selected,
  status,
  onSelect,
  onRemoveWorktree,
}: {
  homeDirectory: string;
  mainClonePath: string;
  worktree: Worktree;
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
        onPointerUp={releasePointerFocus}
      >
        <span className={styles.worktreeIcon} aria-hidden="true">
          {worktree.isMain ? <FolderRoot size={13} /> : <FolderGit2 size={13} />}
        </span>
        <span className={styles.worktreeCopy}>
          <span className={styles.worktreeTopLine}>
            <SidebarTooltip
              className={styles.worktreeNameWrap}
              label={worktree.displayName}
              labelClassName={styles.worktreeName}
              tooltip={
                worktree.isMain ? `Main worktree · ${displayedPath}` : displayedPath
              }
              data-worktree-path={worktree.path}
            />
            {(status === 'dirty' || worktree.pullRequest) && (
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
            )}
          </span>
          <SidebarTooltip
            className={styles.branchNameWrap}
            label={worktree.branch}
            labelClassName={styles.branchName}
            onlyWhenTruncated
            tooltip={worktree.branch}
            data-branch-name={worktree.branch}
          />
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

function releasePointerFocus(event: React.PointerEvent<HTMLButtonElement>): void {
  event.currentTarget.blur();
}
