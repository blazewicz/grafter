import { FolderGit2, FolderRoot, GitBranch } from 'lucide-react';
import type { Worktree } from '../../../shared/contracts';
import { collapseHomePath } from '../../../shared/path-display';
import { buildWorktreeList } from '../../../shared/worktree-list';
import styles from './details.module.css';

export function ProjectWorktreeList({
  homeDirectory,
  worktrees,
  onSelect,
}: {
  homeDirectory: string;
  worktrees: Worktree[];
  onSelect: (worktreeId: string) => void;
}): React.JSX.Element {
  const worktreeItems = buildWorktreeList(worktrees);

  return (
    <>
      <div className={styles.sectionHeading}>
        <div>
          <FolderGit2 size={16} />
          <span>Worktrees</span>
        </div>
        <span className={styles.worktreeCount}>
          {worktrees.length} {worktrees.length === 1 ? 'worktree' : 'worktrees'}
        </span>
      </div>
      <section className={styles.worktreeSummary} aria-label="Worktrees">
        {worktreeItems.map(({ worktree }) => {
          const displayedPath = collapseHomePath(worktree.path, homeDirectory);

          return (
            <div className={styles.worktreeSummaryRow} key={worktree.id}>
              {worktree.isMain ? (
                <FolderRoot className={styles.worktreeSummaryIcon} size={13} />
              ) : (
                <GitBranch className={styles.worktreeSummaryIcon} size={13} />
              )}
              <button
                className={styles.worktreeSummaryName}
                data-main={worktree.isMain}
                title={displayedPath}
                onClick={() => onSelect(worktree.id)}
              >
                {displayedPath}
              </button>
              <span className={styles.worktreeSummaryBranch}>{worktree.branch}</span>
            </div>
          );
        })}
      </section>
    </>
  );
}
