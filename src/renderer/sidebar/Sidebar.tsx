import { Plus, Settings } from 'lucide-react';
import type { Project, Worktree, WorktreeStatus } from '../../shared/contracts';
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
      <nav className={styles.sidebarMenu} aria-label="Menu">
        <button
          className={styles.menuItem}
          aria-label="New worktree"
          aria-keyshortcuts="Meta+N"
          onClick={onAddWorktree}
        >
          <Plus size={15} />
          <span>New worktree</span>
        </button>
        <button
          className={styles.menuItem}
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <Settings size={15} />
          <span>Settings</span>
        </button>
      </nav>
      <WorktreeSection
        homeDirectory={homeDirectory}
        repository={repository}
        selectedId={selectedId}
        selectedWorktreeStatus={selectedWorktreeStatus}
        onSelect={onSelect}
        onRemoveWorktree={onRemoveWorktree}
      />
      <div className={styles.sidebarTerminator} aria-hidden="true" />
      <ResizeHandle width={width} onResize={onResize} />
    </aside>
  );
}
