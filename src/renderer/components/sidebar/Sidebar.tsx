import { Settings } from 'lucide-react';
import { useRef } from 'react';
import type { GrafterApi, Project, Worktree } from '../../../shared/contracts';
import styles from './sidebar.module.css';
import { ProjectTree } from './ProjectTree';

const minimumSidebarWidth = 230;
const maximumSidebarWidth = 480;
export const defaultSidebarWidth = 292;
const keyboardResizeStep = 16;

export function Sidebar({
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
  projects: Project[];
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
  return (
    <aside className={styles.sidebar} id="sidebar">
      <div className={styles.sidebarChrome} aria-hidden="true" />
      <div className={styles.sidebarBrand}>Grafter</div>
      <ProjectTree
        projects={projects}
        homeDirectory={homeDirectory}
        selectedId={selectedId}
        expanded={expanded}
        onToggleProject={onToggleProject}
        onExpandProject={onExpandProject}
        onChooseProject={onChooseProject}
        onRemoveProject={onRemoveProject}
        onRemoveWorktree={onRemoveWorktree}
        onSelect={onSelect}
        onCreated={onCreated}
        onError={onError}
      />
      <button className={styles.sidebarSettings} onClick={onOpenSettings}>
        <Settings size={15} /> Settings
      </button>
      <ResizeHandle width={width} onResize={onResize} />
    </aside>
  );
}

function ResizeHandle({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}): React.JSX.Element {
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
    <div
      className={styles.sidebarResizeHandle}
      role="separator"
      aria-label="Resize projects sidebar"
      aria-controls="sidebar"
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
  );
}
