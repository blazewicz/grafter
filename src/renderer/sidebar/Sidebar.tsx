import { Settings } from 'lucide-react';
import type { Project, Worktree, WorktreeStatus } from '../../shared/contracts';
import { RepositoryIdentity } from './RepositoryIdentity';
import { ResizeHandle } from './ResizeHandle';
import styles from './sidebar.module.css';
import { WorktreeSection } from './WorktreeSection';

export function Sidebar({
  homeDirectory,
  repository,
  width,
  selectedId,
  selectedWorktreeStatus,
  onSelect,
  onAddWorktree,
  onRemoveWorktree,
  onOpenSettings,
  onResize,
}: {
  homeDirectory: string;
  repository: Project;
  width: number;
  selectedId: string | undefined;
  selectedWorktreeStatus: WorktreeStatus | undefined;
  onSelect: (id: string) => void;
  onAddWorktree: () => void;
  onRemoveWorktree: (worktree: Worktree) => void;
  onOpenSettings: () => void;
  onResize: (width: number) => void;
}): React.JSX.Element {
  return (
    <aside className={styles.sidebar} id="sidebar">
      <div className={styles.sidebarChrome} aria-hidden="true" />
      <div className={styles.sidebarBrand}>Grafter</div>
      <RepositoryIdentity
        repository={repository}
        selected={selectedId === repository.id}
        onSelect={() => onSelect(repository.id)}
      />
      <WorktreeSection
        homeDirectory={homeDirectory}
        repository={repository}
        selectedId={selectedId}
        selectedWorktreeStatus={selectedWorktreeStatus}
        onSelect={onSelect}
        onAddWorktree={onAddWorktree}
        onRemoveWorktree={onRemoveWorktree}
      />
      <button className={styles.sidebarSettings} onClick={onOpenSettings}>
        <Settings size={15} /> Settings
      </button>
      <ResizeHandle width={width} onResize={onResize} />
    </aside>
  );
}
