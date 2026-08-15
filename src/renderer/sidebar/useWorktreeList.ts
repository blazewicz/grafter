import { useMemo } from 'react';
import type { Project } from '../../shared/contracts';
import {
  filterWorktrees,
  sortWorktrees,
  type WorktreeFilterMatch,
  type WorktreeSortOrder,
} from '../../shared/worktree-list';
import { menuKeyAction, nextWrapIndex } from '../ui/menu-navigation';

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

export type WorktreeKeyAction =
  | { kind: 'highlight'; id: string | undefined }
  | { kind: 'select'; id: string | undefined };

/**
 * Maps a key press to a highlight or commit action over the visible worktrees.
 * Space is never an action here (typing and button activation own it).
 */
export function worktreeKeyAction(
  key: string,
  highlightedId: string | undefined,
  visibleIds: readonly string[],
): WorktreeKeyAction | undefined {
  if (key === ' ') return undefined;
  const action = menuKeyAction(key);
  if (!visibleIds.length) return undefined;

  switch (action?.kind) {
    case 'move': {
      const current = visibleIds.indexOf(highlightedId ?? '');
      const next =
        current < 0
          ? action.offset > 0
            ? 0
            : visibleIds.length - 1
          : nextWrapIndex(current, action.offset, visibleIds.length);
      return { kind: 'highlight', id: visibleIds[next] };
    }
    case 'home':
      return { kind: 'highlight', id: visibleIds[0] };
    case 'end':
      return { kind: 'highlight', id: visibleIds[visibleIds.length - 1] };
    case 'select':
      return { kind: 'select', id: highlightedId ?? visibleIds[0] };
    default:
      return undefined;
  }
}
