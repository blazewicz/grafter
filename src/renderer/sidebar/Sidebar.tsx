import { Filter, FolderOpen, Plus, Search, Settings } from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { Project, Worktree, WorktreeStatus } from '../../shared/contracts';
import type { WorktreeSortOrder } from '../../shared/worktree-list';
import controls from '../styles/controls.module.css';
import { QuickTooltip } from '../ui/QuickTooltip';
import styles from './sidebar.module.css';
import {
  useWorktreeList,
  resolveHighlightedId,
  worktreeKeyAction,
} from './useWorktreeList';
import { WorktreeList, worktreeListboxId, worktreeRowId } from './WorktreeList';
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
  const [worktreeSortOrder, setWorktreeSortOrder] = useState<WorktreeSortOrder>('path');
  const {
    filterOpen,
    worktreeFilter,
    filterInputRef,
    filterToggleRef,
    setWorktreeFilter,
    openWorktreeFilter,
    closeWorktreeFilter,
  } = useWorktreeFilter();
  const visibleWorktrees = useWorktreeList(repository, worktreeSortOrder, worktreeFilter);
  const visibleWorktreeIds = useMemo(
    () => visibleWorktrees.map((match) => match.worktree.id),
    [visibleWorktrees],
  );
  const [highlightTarget, setHighlightTarget] = useState<string | undefined>(selectedId);
  const highlightedId = useMemo(() => {
    if (highlightTarget !== undefined && visibleWorktreeIds.includes(highlightTarget)) {
      return highlightTarget;
    }
    if (filterOpen && worktreeFilter.trim() !== '') {
      return visibleWorktrees[0]?.worktree.id;
    }
    return resolveHighlightedId(highlightTarget, selectedId, visibleWorktreeIds);
  }, [
    filterOpen,
    worktreeFilter,
    highlightTarget,
    selectedId,
    visibleWorktrees,
    visibleWorktreeIds,
  ]);

  const selectWorktree = (id: string): void => {
    setHighlightTarget(id);
    if (filterOpen) closeWorktreeFilter();
    onSelect(id);
  };

  const handleWorktreeKeys = useEffectEvent((event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setHighlightTarget(selectedId);
      if (filterOpen) closeWorktreeFilter();
      return;
    }
    const action = worktreeKeyAction(event.key, highlightedId, visibleWorktreeIds);
    if (!action) return;
    event.preventDefault();
    if (action.kind === 'highlight') {
      setHighlightTarget(action.id);
    } else if (action.id !== undefined) {
      selectWorktree(action.id);
    }
  });

  useEffect(() => {
    const handleWorktreeListKeys = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) {
        return;
      }
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
        return;
      }
      if (document.querySelector('[role="menu"]')) return;
      handleWorktreeKeys(event);
    };
    document.addEventListener('keydown', handleWorktreeListKeys);
    return () => document.removeEventListener('keydown', handleWorktreeListKeys);
  }, []);

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
          <QuickTooltip label="New worktree (⌘N)" showDelay={0} align="right">
            <button
              className={`${controls.iconButton} ${styles.headingAction}`}
              aria-label={`Add worktree to ${repository.name}`}
              aria-keyshortcuts="Meta+N"
              onClick={onAddWorktree}
            >
              <Plus size={15} />
            </button>
          </QuickTooltip>
          <QuickTooltip
            label={filterOpen ? undefined : 'Filter worktrees (⌘F)'}
            showDelay={0}
            align="right"
          >
            <button
              ref={filterToggleRef}
              className={`${controls.iconButton} ${styles.headingAction}`}
              aria-label="Filter worktrees"
              aria-keyshortcuts="Meta+F"
              aria-expanded={filterOpen}
              onClick={() => {
                if (filterOpen) closeWorktreeFilter();
                else openWorktreeFilter();
              }}
            >
              <Filter size={14} />
            </button>
          </QuickTooltip>
          <WorktreeSortMenu value={worktreeSortOrder} onChange={setWorktreeSortOrder} />
        </div>
      </div>
      {filterOpen && (
        <label className={styles.worktreeFilter}>
          <Search size={13} aria-hidden="true" />
          <input
            ref={filterInputRef}
            type="search"
            role="combobox"
            aria-label="Filter worktrees by path or branch"
            aria-expanded
            aria-controls={worktreeListboxId}
            aria-activedescendant={
              highlightedId !== undefined ? worktreeRowId(highlightedId) : undefined
            }
            placeholder="Filter path or branch…"
            value={worktreeFilter}
            onChange={(event) => setWorktreeFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setHighlightTarget(selectedId);
                closeWorktreeFilter();
                return;
              }
              const action = worktreeKeyAction(
                event.key,
                highlightedId,
                visibleWorktreeIds,
              );
              if (action?.kind === 'highlight') {
                event.preventDefault();
                setHighlightTarget(action.id);
              } else if (action?.kind === 'select') {
                event.preventDefault();
                if (action.id !== undefined) selectWorktree(action.id);
              }
            }}
          />
        </label>
      )}
      <div className={styles.repositoryWorktrees}>
        <WorktreeList
          homeDirectory={homeDirectory}
          project={repository}
          visibleWorktrees={visibleWorktrees}
          selectedId={selectedId}
          highlightedId={highlightedId}
          selectedWorktreeStatus={selectedWorktreeStatus}
          filterQuery={worktreeFilter}
          onSelect={selectWorktree}
          onRemoveWorktree={onRemoveWorktree}
        />
      </div>
      <button className={styles.sidebarSettings} onClick={onOpenSettings}>
        <Settings size={15} /> Settings
      </button>
      <ResizeHandle width={width} onResize={onResize} />
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
