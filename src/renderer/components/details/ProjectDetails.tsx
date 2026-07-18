import { FolderGit2 } from 'lucide-react';
import type { ProjectTreeItem } from '../../../shared/contracts';
import { collapseHomePath } from '../../../shared/path-display';
import { WorktreeSummary } from './WorktreeSummary';
import styles from './details.module.css';

export function ProjectDetails({
  homeDirectory,
  project,
}: {
  homeDirectory: string;
  project: ProjectTreeItem;
}): React.JSX.Element {
  return (
    <div className={styles.detailsWrap}>
      <div className={styles.detailsEyebrow}>
        <FolderGit2 size={14} /> Git project
      </div>
      <div className={styles.detailsTitleRow}>
        <div>
          <h1>{project.name}</h1>
          <p>
            {project.worktrees.length}{' '}
            {project.worktrees.length === 1
              ? 'checked-out branch'
              : 'checked-out branches'}
          </p>
        </div>
      </div>
      <section className={styles.pathCard}>
        <div className={styles.pathCopy}>
          <span className={styles.sectionLabel}>MAIN CLONE</span>
          <code>{collapseHomePath(project.path, homeDirectory)}</code>
        </div>
      </section>
      <WorktreeSummary
        homeDirectory={homeDirectory}
        mainClonePath={project.path}
        worktrees={project.worktrees}
      />
    </div>
  );
}
