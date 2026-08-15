import { Filter, Plus, Search, Settings } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Project, Worktree, WorktreeStatus } from '../../shared/contracts';
import type { WorktreeSortOrder } from '../../shared/worktree-list';
import controls from '../styles/controls.module.css';
import { QuickTooltip } from '../ui/QuickTooltip';
import { RepositoryIdentity } from './RepositoryIdentity';
import { ResizeHandle } from './ResizeHandle';
import styles from './sidebar.module.css';
import {
  useWorktreeList,
  resolveHighlightedId,
  worktreeKeyAction,
} from './useWorktreeList';
import { WorktreeRow, worktreeRowId } from './WorktreeRow';
import { WorktreeSortMenu } from './WorktreeSortMenu';
import { useWorktreeFilter } from './useWorktreeFilter';

export const worktreeListboxId = 'worktree-listbox';

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
  const [previousSelectedId, setPreviousSelectedId] = useState(selectedId);
  if (previousSelectedId !== selectedId) {
    setPreviousSelectedId(selectedId);
    setHighlightTarget(selectedId);
  }
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

  useEffect(() => {
    if (highlightedId === undefined) return;
    document
      .getElementById(worktreeRowId(highlightedId))
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlightedId]);

  const selectWorktree = (id: string): void => {
    setHighlightTarget(id);
    if (filterOpen) closeWorktreeFilter();
    onSelect(id);
  };

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
            aria-autocomplete="list"
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
                selectWorktree(action.id);
              }
            }}
          />
        </label>
      )}
      <div className={styles.repositoryWorktrees}>
        <div
          id={worktreeListboxId}
          className={`${styles.branchList} ${styles.flatWorktreeList}`}
          role="listbox"
          aria-label={`${repository.name} worktrees`}
        >
          {visibleWorktrees.length ? (
            visibleWorktrees.map(({ worktree, displayNameIndexes, branchIndexes }) => (
              <WorktreeRow
                key={worktree.id}
                homeDirectory={homeDirectory}
                mainClonePath={repository.path}
                worktree={worktree}
                displayNameIndexes={displayNameIndexes}
                branchIndexes={branchIndexes}
                selected={selectedId === worktree.id}
                highlighted={worktree.id === highlightedId}
                status={selectedId === worktree.id ? selectedWorktreeStatus : undefined}
                onSelect={selectWorktree}
                onRemoveWorktree={onRemoveWorktree}
              />
            ))
          ) : (
            <div className={styles.emptyWorktreeList} role="status">
              No worktrees match “{worktreeFilter.trim()}”
            </div>
          )}
        </div>
      </div>
      <button className={styles.sidebarSettings} onClick={onOpenSettings}>
        <Settings size={15} /> Settings
      </button>
      <ResizeHandle width={width} onResize={onResize} />
    </aside>
  );
}
