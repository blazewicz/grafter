import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  GitBranch,
  Minus,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GrafterApi, ProjectTreeItem, Worktree } from '../../../shared/contracts';
import { NewWorktreeForm } from './NewWorktreeForm';

export function ProjectNode({
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
  project: ProjectTreeItem;
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeMenu = (): void => setMenuOpen(false);
    document.addEventListener('click', closeMenu);

    return () => document.removeEventListener('click', closeMenu);
  }, [menuOpen]);

  return (
    <div
      className="project-node"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <div
        className={`tree-row project-row ${selectedId === project.id ? 'selected' : ''}`}
      >
        <button
          className="tree-toggle"
          aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
          onClick={onToggle}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button className="tree-label" onClick={() => onSelect(project.id)}>
          <FolderGit2 size={15} />
          <span>{project.name}</span>
        </button>
        <div className="row-actions">
          <button
            aria-label={`Add worktree to ${project.name}`}
            title="New worktree"
            onClick={onAdd}
          >
            <Plus size={14} />
          </button>
          <button
            aria-label={`More options for ${project.name}`}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        {menuOpen && (
          <div className="context-menu">
            <button
              onClick={() => {
                setMenuOpen(false);
                onRemoveProject();
              }}
            >
              <Trash2 size={13} /> Remove project
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="tree-children">
          {project.worktrees.map((worktree) => (
            <div
              className={`tree-row worktree-row ${selectedId === worktree.id ? 'selected' : ''}`}
              key={worktree.id}
            >
              <button className="tree-label" onClick={() => onSelect(worktree.id)}>
                <GitBranch size={13} />
                <span>{worktree.branch}</span>
                {worktree.isMain && <span className="main-pill">main clone</span>}
              </button>
              {!worktree.isMain && (
                <div className="row-actions">
                  <button
                    aria-label={`Remove ${worktree.branch} worktree`}
                    title="Remove worktree"
                    onClick={() => onRemoveWorktree(worktree)}
                  >
                    <Minus size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {adding && (
            <NewWorktreeForm
              project={project}
              onCancel={onCancelAdd}
              onCreated={onCreated}
              onError={onError}
            />
          )}
        </div>
      )}
    </div>
  );
}
