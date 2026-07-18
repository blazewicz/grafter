import { ChevronRight, FolderGit2, LoaderCircle, RefreshCw } from 'lucide-react';
import controls from '../../styles/controls.module.css';
import styles from './AppTitlebar.module.css';

export function AppTitlebar({
  projectName,
  branchName,
  busy,
  onRefresh,
}: {
  projectName: string;
  branchName: string | undefined;
  busy: boolean;
  onRefresh: () => void;
}): React.JSX.Element {
  return (
    <header className={styles.titlebar}>
      <div className={styles.dragRegion} />
      <div className={styles.titleContext}>
        <FolderGit2 size={14} />
        <span className={styles.titleProject}>{projectName}</span>
        {branchName && (
          <>
            <ChevronRight size={13} />
            <span className={styles.titleBranch}>{branchName}</span>
          </>
        )}
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
