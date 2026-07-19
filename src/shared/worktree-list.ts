import type { Worktree } from './contracts';

export interface WorktreeListItem {
  worktree: Worktree;
  displayName: string;
}

export function buildWorktreeList(worktrees: readonly Worktree[]): WorktreeListItem[] {
  const worktreesByName = new Map<string, Worktree[]>();
  const mainWorktreeNames = new Set(
    worktrees
      .filter((worktree) => worktree.isMain)
      .map((worktree) => worktree.name.toLocaleLowerCase()),
  );
  for (const worktree of worktrees) {
    if (worktree.isMain) continue;
    const matches = worktreesByName.get(worktree.name);
    if (matches) matches.push(worktree);
    else worktreesByName.set(worktree.name, [worktree]);
  }

  return worktrees
    .map((worktree) => {
      const matches = worktreesByName.get(worktree.name) ?? [];
      if (worktree.isMain) return { worktree, displayName: 'main' };

      const requiresPathSuffix =
        matches.length > 1 ||
        worktree.name.toLocaleLowerCase() === 'main' ||
        mainWorktreeNames.has(worktree.name.toLocaleLowerCase());
      return {
        worktree,
        displayName: requiresPathSuffix
          ? shortestUniquePathSuffix(worktree, matches)
          : worktree.name,
      };
    })
    .sort(
      (left, right) =>
        Number(right.worktree.isMain) - Number(left.worktree.isMain) ||
        compareText(left.worktree.name, right.worktree.name) ||
        compareText(left.worktree.path, right.worktree.path),
    );
}

function shortestUniquePathSuffix(
  worktree: Worktree,
  matches: readonly Worktree[],
): string {
  const segments = pathSegments(worktree.path);

  for (let length = 2; length <= segments.length; length += 1) {
    const candidate = suffix(segments, length);
    const unique = matches.every(
      (other) =>
        other.id === worktree.id ||
        suffix(pathSegments(other.path), length) !== candidate,
    );
    if (unique) return candidate;
  }

  return worktree.path;
}

function pathSegments(worktreePath: string): string[] {
  return worktreePath.replace(/\/+$/, '').split('/').filter(Boolean);
}

function suffix(segments: readonly string[], length: number): string {
  return segments.slice(-length).join('/');
}

function compareText(left: string, right: string): number {
  return (
    left.toLocaleLowerCase().localeCompare(right.toLocaleLowerCase()) ||
    left.localeCompare(right)
  );
}
