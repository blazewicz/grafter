import { LoaderCircle } from 'lucide-react';
import type {
  ProjectTreeItem,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../../../shared/contracts';
import { ProjectDetails } from './ProjectDetails';
import { Welcome } from './Welcome';
import { WorktreeDetails as WorktreeDetailsView } from './WorktreeDetails';
import styles from './details.module.css';

export function MainView({
  homeDirectory,
  selectedProject,
  selectedWorktree,
  details,
  projectWorktrees,
  status,
  onAdd,
  onSelectWorktree,
  onError,
}: {
  homeDirectory: string;
  selectedProject: ProjectTreeItem | undefined;
  selectedWorktree: Worktree | undefined;
  details: WorktreeDetails | undefined;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  onAdd: () => void;
  onSelectWorktree: (worktreeId: string) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  return (
    <main className={styles.mainView}>
      {selectedWorktree && details?.id === selectedWorktree.id ? (
        <WorktreeDetailsView
          homeDirectory={homeDirectory}
          details={details}
          projectWorktrees={projectWorktrees}
          status={status}
          onError={onError}
        />
      ) : selectedWorktree ? (
        <DetailsLoading />
      ) : selectedProject ? (
        <ProjectDetails project={selectedProject} onSelectWorktree={onSelectWorktree} />
      ) : (
        <Welcome onAdd={onAdd} />
      )}
    </main>
  );
}

function DetailsLoading(): React.JSX.Element {
  return (
    <div className={styles.detailsLoading}>
      <LoaderCircle className="spin" size={20} />
      <span>Inspecting branch workspace…</span>
    </div>
  );
}
