import { Filter, FolderOpen, Plus, Search, Settings } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Worktree, WorktreeStatus } from '../../shared/contracts';
import type { WorktreeSortOrder } from '../../shared/worktree-list';
import controls from '../styles/controls.module.css';
import { QuickTooltip } from '../ui/QuickTooltip';
import styles from './sidebar.module.css';
import { useWorktreeList, resolveHighlightedId } from './useWorktreeList';
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
  const [highlightTarget, setHighlightTarget] = useState<string | undefined>(selectedId);
  const worktreeListRef = useRef<HTMLDivElement>(null);
  const focusedWorktreeList = useRef(false);
  const highlightedId = useMemo(
    () =>
      filterOpen && worktreeFilter.trim() !== ''
        ? visibleWorktrees[0]?.worktree.id
        : resolveHighlightedId(
            highlightTarget,
            selectedId,
            visibleWorktrees.map((match) => match.worktree.id),
          ),
    [filterOpen, worktreeFilter, visibleWorktrees, highlightTarget, selectedId],
  );

  useEffect(() => {
    if (focusedWorktreeList.current) return;
    focusedWorktreeList.current = true;
    if (!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
      worktreeListRef.current?.focus();
    }
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
            aria-label="Filter worktrees by path or branch"
            placeholder="Filter path or branch…"
            value={worktreeFilter}
            onChange={(event) => setWorktreeFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setHighlightTarget(selectedId);
                closeWorktreeFilter();
                worktreeListRef.current?.focus();
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const top = visibleWorktrees[0]?.worktree.id;
                if (top) {
                  onSelect(top);
                  closeWorktreeFilter();
                  worktreeListRef.current?.focus();
                }
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
          listRef={worktreeListRef}
          onHighlight={setHighlightTarget}
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
