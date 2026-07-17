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
  selectedProject,
  selectedWorktree,
  details,
  projectWorktrees,
  status,
  onAdd,
  onError,
}: {
  selectedProject: ProjectTreeItem | undefined;
  selectedWorktree: Worktree | undefined;
  details: WorktreeDetails | undefined;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  onAdd: () => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  return (
    <main className={styles.mainView}>
      {selectedWorktree && details?.id === selectedWorktree.id ? (
        <WorktreeDetailsView
          details={details}
          projectWorktrees={projectWorktrees}
          status={status}
          onError={onError}
        />
      ) : selectedWorktree ? (
        <DetailsLoading />
      ) : selectedProject ? (
        <ProjectDetails project={selectedProject} />
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
