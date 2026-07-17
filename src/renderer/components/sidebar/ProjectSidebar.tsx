import { FolderOpen, Plus, Settings } from 'lucide-react';
import { useState } from 'react';
import type { GrafterApi, ProjectTreeItem, Worktree } from '../../../shared/contracts';
import { EmptyTree } from './EmptyTree';
import { ProjectNode } from './ProjectNode';

export function ProjectSidebar({
  projects,
  selectedId,
  expanded,
  onSelect,
  onToggleProject,
  onExpandProject,
  onChooseProject,
  onCreated,
  onRemoveProject,
  onRemoveWorktree,
  onOpenSettings,
  onError,
}: {
  projects: ProjectTreeItem[];
  selectedId: string | undefined;
  expanded: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onToggleProject: (projectId: string) => void;
  onExpandProject: (projectId: string) => void;
  onChooseProject: () => void;
  onCreated: (
    projectId: string,
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveProject: (projectId: string) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
  onOpenSettings: () => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [addingTo, setAddingTo] = useState<string>();

  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <span>Projects</span>
        <button
          className="icon-button"
          aria-label="Add Git project"
          title="Add Git project"
          onClick={onChooseProject}
        >
          <FolderOpen size={16} />
          <Plus className="corner-plus" size={9} />
        </button>
      </div>
      <div className="project-tree">
        {projects.map((project) => (
          <ProjectNode
            key={project.id}
            project={project}
            expanded={expanded.has(project.id)}
            selectedId={selectedId}
            adding={addingTo === project.id}
            onToggle={() => onToggleProject(project.id)}
            onSelect={onSelect}
            onAdd={() => {
              setAddingTo(project.id);
              onExpandProject(project.id);
            }}
            onCancelAdd={() => setAddingTo(undefined)}
            onCreated={(result, request) => {
              setAddingTo(undefined);
              onCreated(project.id, result, request);
            }}
            onRemoveProject={() => onRemoveProject(project.id)}
            onRemoveWorktree={onRemoveWorktree}
            onError={onError}
          />
        ))}
        {!projects.length && <EmptyTree onAdd={onChooseProject} />}
      </div>
      <button className="sidebar-settings" onClick={onOpenSettings}>
        <Settings size={15} /> Settings
      </button>
    </aside>
  );
}
