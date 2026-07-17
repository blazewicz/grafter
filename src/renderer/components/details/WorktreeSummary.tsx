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
          <span>Project worktrees</span>
        </div>
        <span className={styles.worktreeCount}>
          {worktrees.length} {worktrees.length === 1 ? 'worktree' : 'worktrees'}
        </span>
      </div>
      <section className={styles.worktreeSummary} aria-label="Project worktrees">
        {worktrees.map((worktree) => (
          <div
            className={`${styles.worktreeSummaryRow} ${
              worktree.id === selectedId ? styles.current : ''
            }`}
            key={worktree.id}
          >
            <div className={styles.worktreeSummaryPath}>
              <span>{worktree.isMain ? 'Main working tree' : 'Linked worktree'}</span>
              <code title={worktree.path}>{worktree.path}</code>
            </div>
            <div className={styles.worktreeSummaryBranch}>
              <GitBranch size={13} />
              <span>{worktree.branch}</span>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
