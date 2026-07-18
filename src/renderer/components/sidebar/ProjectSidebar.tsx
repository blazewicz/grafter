import { FolderOpen, Plus, Settings } from 'lucide-react';
import { useRef, useState } from 'react';
import type { GrafterApi, ProjectTreeItem, Worktree } from '../../../shared/contracts';
import controls from '../../styles/controls.module.css';
import { EmptyTree } from './EmptyTree';
import { ProjectNode } from './ProjectNode';
import styles from './sidebar.module.css';

const minimumSidebarWidth = 230;
const maximumSidebarWidth = 480;
export const defaultSidebarWidth = 292;
const keyboardResizeStep = 16;

export function ProjectSidebar({
  homeDirectory,
  projects,
  width,
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
  onResize,
}: {
  homeDirectory: string;
  projects: ProjectTreeItem[];
  width: number;
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
  onResize: (width: number) => void;
}): React.JSX.Element {
  const [addingTo, setAddingTo] = useState<string>();
  const resizeStart = useRef<
    | {
        pointerId: number;
        pointerX: number;
        width: number;
      }
    | undefined
  >(undefined);

  const resizeTo = (nextWidth: number): void => {
    onResize(Math.min(maximumSidebarWidth, Math.max(minimumSidebarWidth, nextWidth)));
  };

  return (
    <aside className={styles.sidebar} id="project-sidebar">
      <div className={styles.sidebarChrome} aria-hidden="true" />
      <div className={styles.sidebarBrand}>Grafter</div>
      <div className={styles.sidebarHeading}>
        <span>Projects</span>
        <button
          className={`${controls.iconButton} ${styles.headingAction}`}
          aria-label="Add Git project"
          title="Add Git project"
          onClick={onChooseProject}
        >
          <FolderOpen size={16} />
          <Plus className={styles.cornerPlus} size={9} />
        </button>
      </div>
      <div className={styles.projectTree}>
        {projects.map((project) => (
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
        ))}
        {!projects.length && <EmptyTree onAdd={onChooseProject} />}
      </div>
      <button className={styles.sidebarSettings} onClick={onOpenSettings}>
        <Settings size={15} /> Settings
      </button>
      <div
        className={styles.sidebarResizeHandle}
        role="separator"
        aria-label="Resize projects sidebar"
        aria-controls="project-sidebar"
        aria-orientation="vertical"
        aria-valuemin={minimumSidebarWidth}
        aria-valuemax={maximumSidebarWidth}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize · Double-click to reset"
        onDoubleClick={() => resizeTo(defaultSidebarWidth)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            resizeTo(width - keyboardResizeStep);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            resizeTo(width + keyboardResizeStep);
          } else if (event.key === 'Home') {
            event.preventDefault();
            resizeTo(defaultSidebarWidth);
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          resizeStart.current = {
            pointerId: event.pointerId,
            pointerX: event.clientX,
            width,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = resizeStart.current;
          if (start?.pointerId !== event.pointerId) return;
          resizeTo(start.width + event.clientX - start.pointerX);
        }}
        onPointerUp={(event) => {
          if (resizeStart.current?.pointerId !== event.pointerId) return;
          resizeStart.current = undefined;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          resizeStart.current = undefined;
        }}
      />
    </aside>
  );
}
