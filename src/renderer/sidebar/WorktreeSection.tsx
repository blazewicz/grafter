import { Filter, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Project, Worktree, WorktreeStatus } from '../../shared/contracts';
import type { WorktreeSortOrder } from '../../shared/worktree-list';
import controls from '../styles/controls.module.css';
import { QuickTooltip } from '../ui/QuickTooltip';
import styles from './sidebar.module.css';
import { useWorktreeFilter } from './useWorktreeFilter';
import {
  resolveHighlightedId,
  useWorktreeList,
  worktreeKeyAction,
} from './useWorktreeList';
import { WorktreeRow, worktreeRowId } from './WorktreeRow';
import { WorktreeSortMenu } from './WorktreeSortMenu';

export const worktreeListboxId = 'worktree-listbox';

export function WorktreeSection({
  homeDirectory,
  repository,
  selectedId,
  selectedWorktreeStatus,
  onSelect,
  onRemoveWorktree,
}: {
  homeDirectory: string;
  repository: Project;
  selectedId: string | undefined;
  selectedWorktreeStatus: WorktreeStatus | undefined;
  onSelect: (id: string) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
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
  const highlightedId = useMemo(
    () =>
      resolveHighlightedId(
        highlightTarget,
        filterOpen ? undefined : selectedId,
        visibleWorktreeIds,
      ),
    [highlightTarget, filterOpen, selectedId, visibleWorktreeIds],
  );

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
    <>
      <div className={styles.sidebarHeading}>
        <span>Worktrees</span>
        <div className={styles.headingActions}>
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
            onChange={(event) => {
              const nextFilter = event.target.value;
              setWorktreeFilter(nextFilter);
              if (nextFilter.trim() === '') {
                setHighlightTarget(selectedId);
              } else {
                setHighlightTarget(undefined);
              }
            }}
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
            visibleWorktrees.map(({ worktree, displayNameIndexes, branchIndexes }) => {
              const highlighted = worktree.id === highlightedId;
              return (
                <WorktreeRow
                  key={worktree.id}
                  homeDirectory={homeDirectory}
                  mainClonePath={repository.path}
                  worktree={worktree}
                  displayNameIndexes={displayNameIndexes}
                  branchIndexes={branchIndexes}
                  selected={selectedId === worktree.id}
                  highlighted={highlighted}
                  tabbable={!filterOpen && highlighted}
                  status={selectedId === worktree.id ? selectedWorktreeStatus : undefined}
                  onSelect={selectWorktree}
                  onRemoveWorktree={onRemoveWorktree}
                />
              );
            })
          ) : (
            <div className={styles.emptyWorktreeList} role="status">
              No worktrees match “{worktreeFilter.trim()}”
            </div>
          )}
        </div>
      </div>
    </>
  );
}
