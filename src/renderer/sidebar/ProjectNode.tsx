import { ChevronDown, ChevronRight, FolderOpen, FolderMinus, Plus } from 'lucide-react';
import type { GrafterApi, Project, Worktree } from '../../shared/contracts';
import { WorktreeList } from './WorktreeList';
import styles from './sidebar.module.css';

export function ProjectNode({
  homeDirectory,
  project,
  expanded,
  selectedId,
  adding,
  onToggle,
  onSelect,
  onAdd,
  onCancelAdd,
  onCreated,
  onRemoveProject,
  onRemoveWorktree,
  onError,
}: {
  homeDirectory: string;
  project: Project;
  expanded: boolean;
  selectedId: string | undefined;
  adding: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onCancelAdd: () => void;
  onCreated: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveProject: () => void;
  onRemoveWorktree: (worktree: Worktree) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  return (
    <>
      <ProjectRoot
        project={project}
        expanded={expanded}
        selectedId={selectedId}
        onToggle={onToggle}
        onSelect={onSelect}
        onAdd={onAdd}
        onRemoveProject={onRemoveProject}
      />
      {expanded && (
        <WorktreeList
          homeDirectory={homeDirectory}
          project={project}
          selectedId={selectedId}
          adding={adding}
          onSelect={onSelect}
          onCancelAdd={onCancelAdd}
          onCreated={onCreated}
          onRemoveWorktree={onRemoveWorktree}
          onError={onError}
        />
      )}
    </>
  );
}

function ProjectRoot({
  project,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  onAdd,
  onRemoveProject,
}: {
  project: Project;
  expanded: boolean;
  selectedId: string | undefined;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemoveProject: () => void;
}): React.JSX.Element {
  return (
    <div
      className={`${styles.treeRow} ${styles.projectRow} ${
        selectedId === project.id ? styles.selected : ''
      }`}
    >
      <button
        className={styles.treeToggle}
        aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
        onClick={onToggle}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <button
        className={styles.treeLabel}
        onClick={() => onSelect(project.id)}
        onPointerUp={releasePointerFocus}
      >
        <FolderOpen size={15} />
        <span>{project.name}</span>
      </button>
      <div className={styles.rowActions}>
        <button
          aria-label={`Add worktree to ${project.name}`}
          title="New worktree"
          onClick={onAdd}
        >
          <Plus size={14} />
        </button>
        <button
          aria-label={`Remove ${project.name} from Grafter`}
          aria-haspopup="dialog"
          title="Remove from Grafter"
          onClick={onRemoveProject}
        >
          <FolderMinus size={13} />
        </button>
      </div>
    </div>
  );
}

function releasePointerFocus(event: React.PointerEvent<HTMLButtonElement>): void {
  event.currentTarget.blur();
}
