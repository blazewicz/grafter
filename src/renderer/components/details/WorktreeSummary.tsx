import { FolderGit2, GitBranch } from 'lucide-react';
import type { Worktree } from '../../../shared/contracts';
import styles from './details.module.css';

export function WorktreeSummary({
  worktrees,
  selectedId,
}: {
  worktrees: Worktree[];
  selectedId?: string;
}): React.JSX.Element {
  return (
    <>
      <div className={styles.sectionHeading}>
        <div>
          <FolderGit2 size={16} />
          <span>Checked-out branches</span>
        </div>
        <span className={styles.worktreeCount}>
          {worktrees.length} {worktrees.length === 1 ? 'workspace' : 'workspaces'}
        </span>
      </div>
      <section className={styles.worktreeSummary} aria-label="Checked-out branches">
        {worktrees.map((worktree) => (
          <div
            className={`${styles.worktreeSummaryRow} ${
              worktree.id === selectedId ? styles.current : ''
            }`}
            key={worktree.id}
          >
            <div className={styles.worktreeSummaryBranch}>
              <GitBranch size={13} />
              <span>{worktree.branch}</span>
              <span className={styles.summaryWorktreePill}>{worktree.name}</span>
            </div>
            <div className={styles.worktreeSummaryPath}>
              <code title={worktree.path}>{worktree.path}</code>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
