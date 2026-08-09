import { LoaderCircle } from 'lucide-react';
import type {
  AppSnapshot,
  Project,
  Settings,
  ToolPickerGroup,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../../shared/contracts';
import { ProjectDetailsView } from './ProjectDetailsView';
import { WelcomeView } from './WelcomeView';
import { WorktreeDetailsView } from './WorktreeDetailsView';
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
  toolPreferences,
  onSetToolPreference,
  onSnapshot,
  onAdd,
  onSelectWorktree,
  diffOpening,
  onOpenDiff,
  onOpenCommitDiff,
  onError,
}: {
  homeDirectory: string;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  selectedProject: Project | undefined;
  selectedWorktree: Worktree | undefined;
  details: WorktreeDetails | undefined;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  toolPreferences: Record<ToolPickerGroup, string>;
  onSetToolPreference: (group: ToolPickerGroup, tool: string) => void;
  onSnapshot: (snapshot: AppSnapshot) => void;
  onAdd: () => void;
  onSelectWorktree: (worktreeId: string) => void;
  diffOpening: boolean;
  onOpenDiff: (worktreeId: string) => void;
  onOpenCommitDiff: (commitHash: string) => void;
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
          toolPreferences={toolPreferences}
          onSetToolPreference={onSetToolPreference}
          onSnapshot={onSnapshot}
          diffOpening={diffOpening}
          onOpenDiff={() => onOpenDiff(details.id)}
          onOpenCommitDiff={onOpenCommitDiff}
          onError={onError}
        />
      ) : selectedWorktree ? (
        <DetailsLoadingView />
      ) : selectedProject ? (
        <ProjectDetailsView
          homeDirectory={homeDirectory}
          project={selectedProject}
          onSelectWorktree={onSelectWorktree}
        />
      ) : (
        <WelcomeView onAdd={onAdd} />
      )}
    </main>
  );
}

function DetailsLoadingView(): React.JSX.Element {
  return (
    <div className={styles.detailsLoading}>
      <LoaderCircle className="spin" size={20} />
      <span>Inspecting branch workspace…</span>
    </div>
  );
}
