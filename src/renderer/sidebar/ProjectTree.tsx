import { FolderOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import type { GrafterApi, Project, Worktree } from '../../shared/contracts';
import controls from '../styles/controls.module.css';
import { ProjectNode } from './ProjectNode';
import styles from './sidebar.module.css';

export function ProjectTree({
  projects,
  homeDirectory,
  selectedId,
  expanded,
  onToggleProject,
  onExpandProject,
  onChooseProject,
  onRemoveProject,
  onRemoveWorktree,
  onSelect,
  onCreated,
  onError,
}: {
  homeDirectory: string;
  projects: Project[];
  selectedId: string | undefined;
  expanded: ReadonlySet<string>;
  onToggleProject: (projectId: string) => void;
  onExpandProject: (projectId: string) => void;
  onChooseProject: () => void;
  onSelect: (id: string) => void;
  onCreated: (
    projectId: string,
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveProject: (projectId: string) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [addingTo, setAddingTo] = useState<string>();

  return (
    <>
      <Heading onChooseProject={onChooseProject} />
      <div className={styles.projectTree}>
        {projects.length ? (
          projects.map((project) => (
            <ProjectNode
              key={project.id}
              homeDirectory={homeDirectory}
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
          ))
        ) : (
          <div className={styles.emptyTree}>
            <FolderOpen size={23} />
            <span>No projects yet</span>
            <p>Add a Git repository from any of its worktrees.</p>
            <button
              className={`${controls.button} ${controls.subtle}`}
              onClick={onChooseProject}
            >
              <Plus size={13} /> Open Repository...
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Heading({
  onChooseProject,
}: {
  onChooseProject: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.sidebarHeading}>
      <span>Projects</span>
      <button
        className={`${controls.iconButton} ${styles.headingAction}`}
        aria-label="Open Repository..."
        title="Open Repository..."
        onClick={onChooseProject}
      >
        <FolderOpen size={16} />
        <Plus className={styles.cornerPlus} size={9} />
      </button>
    </div>
  );
}
