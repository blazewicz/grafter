import fuzzysort from 'fuzzysort';
import type { Worktree } from './contracts';

export type WorktreeWithoutDisplayName = Omit<Worktree, 'displayName'>;
export type WorktreeSortOrder = 'path' | 'branch';

export interface WorktreeFilterMatch {
  worktree: Worktree;
  displayNameIndexes: readonly number[];
  branchIndexes: readonly number[];
}

export function resolveWorktreeDisplayNames(
  worktrees: readonly WorktreeWithoutDisplayName[],
): Worktree[] {
  const worktreesByBasename = new Map<string, WorktreeWithoutDisplayName[]>();
  const mainWorktreeBasenames = new Set(
    worktrees
      .filter((worktree) => worktree.isMain)
      .map((worktree) => worktreeBasename(worktree.path).toLocaleLowerCase()),
  );
  for (const worktree of worktrees) {
    if (worktree.isMain) continue;
    const basename = worktreeBasename(worktree.path);
    const matches = worktreesByBasename.get(basename);
    if (matches) matches.push(worktree);
    else worktreesByBasename.set(basename, [worktree]);
  }

  return worktrees.map((worktree) => {
    if (worktree.isMain) return { ...worktree, displayName: 'main' };

    const basename = worktreeBasename(worktree.path);
    const matches = worktreesByBasename.get(basename) ?? [];
    const requiresPathSuffix =
      matches.length > 1 ||
      basename.toLocaleLowerCase() === 'main' ||
      mainWorktreeBasenames.has(basename.toLocaleLowerCase());
    return {
      ...worktree,
      displayName: requiresPathSuffix
        ? shortestUniquePathSuffix(worktree, matches)
        : basename,
    };
  });
}

export function sortWorktrees(
  worktrees: readonly Worktree[],
  order?: WorktreeSortOrder,
): Worktree[] {
  return [...worktrees].sort(
    (left, right) =>
      Number(right.isMain) - Number(left.isMain) ||
      compareText(
        order === 'branch'
          ? left.branch
          : order === 'path'
            ? left.path
            : left.displayName,
        order === 'branch'
          ? right.branch
          : order === 'path'
            ? right.path
            : right.displayName,
      ) ||
      compareText(left.path, right.path) ||
      compareText(left.id, right.id),
  );
}

export function filterWorktrees(
  worktrees: readonly Worktree[],
  query: string,
): WorktreeFilterMatch[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return worktrees.map((worktree) => ({
      worktree,
      displayNameIndexes: [],
      branchIndexes: [],
    }));
  }

  const results = fuzzysort.go(normalizedQuery, worktrees, {
    keys: ['path', 'branch'],
    limit: 0,
    threshold: 0,
  });
  if (!results.length) return [];

  const ordered = [
    ...results.filter((result) => result.obj.isMain),
    ...results.filter((result) => !result.obj.isMain),
  ];

  return ordered.map(({ obj }) => {
    const displayNameMatch = fuzzysort.single(normalizedQuery, obj.displayName);
    const branchMatch = fuzzysort.single(normalizedQuery, obj.branch);
    return {
      worktree: obj,
      displayNameIndexes: displayNameMatch?.indexes ?? [],
      branchIndexes: branchMatch?.indexes ?? [],
    };
  });
}

function shortestUniquePathSuffix(
  worktree: WorktreeWithoutDisplayName,
  matches: readonly WorktreeWithoutDisplayName[],
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

function worktreeBasename(worktreePath: string): string {
  const normalized = worktreePath.replace(/\/+$/, '');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || worktreePath;
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
