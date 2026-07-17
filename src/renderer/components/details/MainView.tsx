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
    <main className="main-view">
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
    <div className="details-loading">
      <LoaderCircle className="spin" size={20} />
      <span>Inspecting worktree…</span>
    </div>
  );
}
