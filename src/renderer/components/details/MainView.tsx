import { LoaderCircle } from 'lucide-react';
import type {
  AppSnapshot,
  ProjectTreeItem,
  Settings,
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
  settings,
  systemLocale,
  selectedProject,
  selectedWorktree,
  details,
  projectWorktrees,
  status,
  onSnapshot,
  onAdd,
  onSelectProject,
  onSelectWorktree,
  diffOpening,
  onOpenDiff,
  onError,
}: {
  homeDirectory: string;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  selectedProject: ProjectTreeItem | undefined;
  selectedWorktree: Worktree | undefined;
  details: WorktreeDetails | undefined;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  onSnapshot: (snapshot: AppSnapshot) => void;
  onAdd: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectWorktree: (worktreeId: string) => void;
  diffOpening: boolean;
  onOpenDiff: (worktreeId: string) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  return (
    <main className={styles.mainView}>
      {selectedWorktree && details?.id === selectedWorktree.id ? (
        <WorktreeDetailsView
          homeDirectory={homeDirectory}
          settings={settings}
          systemLocale={systemLocale}
          details={details}
          projectWorktrees={projectWorktrees}
          status={status}
          onSnapshot={onSnapshot}
          onSelectProject={onSelectProject}
          diffOpening={diffOpening}
          onOpenDiff={() => onOpenDiff(details.id)}
          onError={onError}
        />
      ) : selectedWorktree ? (
        <DetailsLoading />
      ) : selectedProject ? (
        <ProjectDetails
          homeDirectory={homeDirectory}
          project={selectedProject}
          onSelectWorktree={onSelectWorktree}
        />
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
