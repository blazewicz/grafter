import { FolderGit2 } from 'lucide-react';
import type { ProjectTreeItem } from '../../../shared/contracts';
import { ProjectWorktreeList } from './ProjectWorktreeList';
import styles from './details.module.css';

export function ProjectDetails({
  project,
  onSelectWorktree,
}: {
  project: ProjectTreeItem;
  onSelectWorktree: (worktreeId: string) => void;
}): React.JSX.Element {
  return (
    <div className={styles.detailsWrap}>
      <div className={styles.detailsEyebrow}>
        <FolderGit2 size={14} /> Git project
      </div>
      <div className={styles.detailsTitleRow}>
        <h1>{project.name}</h1>
      </div>
      <ProjectWorktreeList worktrees={project.worktrees} onSelect={onSelectWorktree} />
    </div>
  );
}
