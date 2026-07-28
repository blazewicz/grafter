import type { Project } from '../../shared/contracts';
import { ProjectWorktreeList } from './ProjectWorktreeList';
import styles from './details.module.css';

export function ProjectDetailsView({
  homeDirectory,
  project,
  onSelectWorktree,
}: {
  homeDirectory: string;
  project: Project;
  onSelectWorktree: (worktreeId: string) => void;
}): React.JSX.Element {
  return (
    <div className={styles.detailsWrap}>
      <ProjectWorktreeList
        homeDirectory={homeDirectory}
        worktrees={project.worktrees}
        onSelect={onSelectWorktree}
      />
    </div>
  );
}
