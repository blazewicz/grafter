import { FolderOpen, Plus, Search, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  GrafterApi,
  Project,
  Worktree,
  WorktreeStatus,
} from '../../shared/contracts';
import type { WorktreeSortOrder } from '../../shared/worktree-list';
import controls from '../styles/controls.module.css';
import styles from './sidebar.module.css';
import { NewWorktreeForm } from './NewWorktreeForm';
import { WorktreeList } from './WorktreeList';
import { WorktreeSortMenu } from './WorktreeSortMenu';
import { useWorktreeFilter } from './useWorktreeFilter';

const minimumSidebarWidth = 230;
const maximumSidebarWidth = 480;
export const defaultSidebarWidth = 292;
const keyboardResizeStep = 16;

export function Sidebar({
  homeDirectory,
  repository,
  width,
  selectedId,
  selectedWorktreeStatus,
  onSelect,
  onCreated,
  onRemoveWorktree,
  onOpenSettings,
  onError,
  onResize,
}: {
  homeDirectory: string;
  repository: Project;
  width: number;
  selectedId: string | undefined;
  selectedWorktreeStatus: WorktreeStatus | undefined;
  onSelect: (id: string) => void;
  onCreated: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
  onOpenSettings: () => void;
  onError: (message: string) => void;
  onResize: (width: number) => void;
}): React.JSX.Element {
  const [adding, setAdding] = useState(false);
  const [worktreeSortOrder, setWorktreeSortOrder] = useState<WorktreeSortOrder>('path');
  const addWorktreeButtonRef = useRef<HTMLButtonElement>(null);
  const {
    filterOpen,
    worktreeFilter,
    filterInputRef,
    setWorktreeFilter,
    openWorktreeFilter,
    closeWorktreeFilter,
  } = useWorktreeFilter();

  useEffect(() => {
    const openNewWorktree = (event: KeyboardEvent): void => {
      if (
        event.key.toLocaleLowerCase() !== 'n' ||
        !event.metaKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      if (adding) return;
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
        return;
      }
      setAdding(true);
    };

    document.addEventListener('keydown', openNewWorktree);
    return () => document.removeEventListener('keydown', openNewWorktree);
  }, [adding]);

  const wasAdding = useRef(false);
  useEffect(() => {
    if (wasAdding.current && !adding) addWorktreeButtonRef.current?.focus();
    wasAdding.current = adding;
  }, [adding]);
  return (
    <aside className={styles.sidebar} id="sidebar">
      <div className={styles.sidebarChrome} aria-hidden="true" />
      <div className={styles.sidebarBrand}>Grafter</div>
      <RepositoryIdentity
        repository={repository}
        selected={selectedId === repository.id}
        onSelect={() => onSelect(repository.id)}
      />
      <div className={styles.sidebarHeading}>
        <span>Worktrees</span>
        <div className={styles.headingActions}>
          <button
            ref={addWorktreeButtonRef}
            className={`${controls.iconButton} ${styles.headingAction}`}
            aria-label={`Add worktree to ${repository.name}`}
            aria-keyshortcuts="Meta+N"
            title="New worktree (⌘N)"
            onClick={() => setAdding(true)}
          >
            <Plus size={15} />
          </button>
          <button
            className={`${controls.iconButton} ${styles.headingAction}`}
            aria-label="Filter worktrees"
            aria-keyshortcuts="Meta+F"
            aria-expanded={filterOpen}
            title="Filter worktrees (⌘F)"
            onClick={() => {
              if (filterOpen) closeWorktreeFilter();
              else openWorktreeFilter();
            }}
          >
            <Search size={14} />
          </button>
          <WorktreeSortMenu value={worktreeSortOrder} onChange={setWorktreeSortOrder} />
        </div>
      </div>
      {filterOpen && (
        <label className={styles.worktreeFilter}>
          <Search size={13} aria-hidden="true" />
          <input
            ref={filterInputRef}
            type="search"
            aria-label="Filter worktrees by path or branch"
            placeholder="Filter path or branch…"
            value={worktreeFilter}
            onChange={(event) => setWorktreeFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              event.stopPropagation();
              closeWorktreeFilter();
            }}
          />
        </label>
      )}
      <div className={styles.repositoryWorktrees}>
        <WorktreeList
          homeDirectory={homeDirectory}
          project={repository}
          selectedId={selectedId}
          selectedWorktreeStatus={selectedWorktreeStatus}
          sortOrder={worktreeSortOrder}
          filterQuery={worktreeFilter}
          flat
          onSelect={(id) => {
            if (filterOpen) closeWorktreeFilter();
            onSelect(id);
          }}
          onRemoveWorktree={onRemoveWorktree}
        />
      </div>
      <button className={styles.sidebarSettings} onClick={onOpenSettings}>
        <Settings size={15} /> Settings
      </button>
      <ResizeHandle width={width} onResize={onResize} />
      {adding && (
        <NewWorktreeForm
          project={repository}
          onCancel={() => setAdding(false)}
          onCreated={(result, request) => {
            setAdding(false);
            onCreated(result, request);
          }}
          onError={onError}
        />
      )}
    </aside>
  );
}

function RepositoryIdentity({
  repository,
  selected,
  onSelect,
}: {
  repository: Project;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <div className={`${styles.repositoryIdentity} ${selected ? styles.selected : ''}`}>
      <button
        className={styles.repositoryIdentityButton}
        aria-label={`${repository.name} repository details`}
        aria-current={selected ? 'page' : undefined}
        title={`Open ${repository.name} repository details`}
        onClick={onSelect}
      >
        <FolderOpen size={16} />
        <span>{repository.name}</span>
      </button>
    </div>
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
      aria-label="Resize repository sidebar"
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
