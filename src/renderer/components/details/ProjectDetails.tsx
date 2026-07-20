import { FolderOpen } from 'lucide-react';
import type { ProjectTreeItem } from '../../../shared/contracts';
import { ProjectWorktreeList } from './ProjectWorktreeList';
import styles from './details.module.css';

export function ProjectDetails({
  homeDirectory,
  project,
  onSelectWorktree,
}: {
  homeDirectory: string;
  project: ProjectTreeItem;
  onSelectWorktree: (worktreeId: string) => void;
}): React.JSX.Element {
  return (
    <div className={styles.detailsWrap}>
      <div className={styles.detailsEyebrow}>
        <FolderOpen size={14} /> Git project
      </div>
      <div className={styles.detailsTitleRow}>
        <h1>{project.name}</h1>
      </div>
      <ProjectWorktreeList
        homeDirectory={homeDirectory}
        worktrees={project.worktrees}
        onSelect={onSelectWorktree}
      />
    </div>
  );
}
