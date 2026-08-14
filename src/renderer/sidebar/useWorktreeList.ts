import { useMemo } from 'react';
import type { Project } from '../../shared/contracts';
import {
  filterWorktrees,
  sortWorktrees,
  type WorktreeFilterMatch,
  type WorktreeSortOrder,
} from '../../shared/worktree-list';

export function useWorktreeList(
  project: Project,
  sortOrder: WorktreeSortOrder,
  filterQuery: string,
): readonly WorktreeFilterMatch[] {
  return useMemo(
    () => filterWorktrees(sortWorktrees(project.worktrees, sortOrder), filterQuery),
    [project.worktrees, sortOrder, filterQuery],
  );
}

export function resolveHighlightedId(
  highlightedId: string | undefined,
  selectedId: string | undefined,
  visibleIds: readonly string[],
): string | undefined {
  if (highlightedId !== undefined && visibleIds.includes(highlightedId)) {
    return highlightedId;
  }
  if (selectedId !== undefined && visibleIds.includes(selectedId)) {
    return selectedId;
  }
  return visibleIds[0];
}
