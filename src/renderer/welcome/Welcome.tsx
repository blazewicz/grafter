import { ArrowRight, FolderOpen } from 'lucide-react';
import type { RecentRepository } from '../../shared/contracts';
import { collapseHomePath } from '../../shared/path-display';
import controls from '../styles/controls.module.css';
import { BranchMark } from '../ui/BrandMarks';
import styles from './Welcome.module.css';

export function Welcome({
  homeDirectory,
  recentRepositories,
  busy,
  onOpenRepository,
  onOpenRecentRepository,
}: {
  homeDirectory: string;
  recentRepositories: readonly RecentRepository[];
  busy: boolean;
  onOpenRepository: () => void;
  onOpenRecentRepository: (repositoryId: string) => void;
}): React.JSX.Element {
  return (
    <main className={styles.welcome} aria-labelledby="welcome-heading">
      <div className={styles.windowDrag} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.brand} aria-hidden="true">
          <BranchMark />
        </div>
        <h1 id="welcome-heading">Welcome to Grafter</h1>
        <p className={styles.introduction}>
          Open a Git repository from any of its worktrees to inspect and manage the whole
          worktree set.
        </p>
        <button
          className={`${controls.button} ${controls.primary} ${styles.openButton}`}
          disabled={busy}
          onClick={onOpenRepository}
        >
          <FolderOpen size={14} /> Open Repository...
        </button>

        {recentRepositories.length > 0 && (
          <section className={styles.recents} aria-labelledby="recent-heading">
            <h2 id="recent-heading">Recent repositories</h2>
            <div className={styles.recentList}>
              {recentRepositories.map((repository) => {
                const displayedPath = collapseHomePath(
                  repository.lastOpenedPath,
                  homeDirectory,
                );
                return (
                  <button
                    key={repository.repositoryId}
                    className={styles.recentItem}
                    aria-label={`Open ${repository.name} repository at ${displayedPath}`}
                    disabled={busy}
                    onClick={() => onOpenRecentRepository(repository.repositoryId)}
                  >
                    <FolderOpen size={15} />
                    <span className={styles.recentText}>
                      <strong>{repository.name}</strong>
                      <span>{displayedPath}</span>
                    </span>
                    <ArrowRight className={styles.recentArrow} size={14} />
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
