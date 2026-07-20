import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  FolderGit2,
  FolderRoot,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import controls from '../../styles/controls.module.css';
import type { Worktree } from '../../../shared/contracts';
import styles from './AppTitlebar.module.css';

export function AppTitlebar({
  projectName,
  worktree,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onSelectProject,
  busy,
  onRefresh,
}: {
  projectName: string;
  worktree: Worktree | undefined;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onSelectProject: (() => void) | undefined;
  busy: boolean;
  onRefresh: () => void;
}): React.JSX.Element {
  return (
    <header className={styles.titlebar}>
      <div className={styles.dragRegion} />
      <div className={styles.titleContext}>
        <div className={styles.historyActions}>
          <button
            className={styles.historyButton}
            aria-label="Back"
            title="Back"
            disabled={!canGoBack}
            onClick={onBack}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className={styles.historyButton}
            aria-label="Forward"
            title="Forward"
            disabled={!canGoForward}
            onClick={onForward}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className={styles.titleBreadcrumb}>
          <FolderOpen size={14} />
          {onSelectProject ? (
            <button
              className={`${styles.titleProject} ${styles.titleProjectButton}`}
              title={`Open ${projectName} project details`}
              onClick={onSelectProject}
            >
              {projectName}
            </button>
          ) : (
            <span className={styles.titleProject}>{projectName}</span>
          )}
          {worktree && (
            <>
              <ChevronRight size={13} />
              {worktree?.isMain ? <FolderRoot size={14} /> : <FolderGit2 size={14} />}
              <span className={styles.titleWorktree}>{worktree?.name}</span>
            </>
          )}
        </div>
      </div>
      <div className={`${styles.titleActions} no-drag`}>
        {busy && <LoaderCircle className="spin" size={14} />}
        <button
          className={controls.iconButton}
          aria-label="Refresh repositories"
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
        </button>
      </div>
    </header>
  );
}
