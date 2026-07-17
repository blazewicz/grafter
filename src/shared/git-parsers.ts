import type { DiffStats, Worktree, WorktreeStatus } from './contracts';

interface WorktreeBlock {
  worktree?: string;
  HEAD?: string;
  branch?: string;
  locked?: string;
  bare?: string;
  detached?: string;
}

export function parseWorktreePorcelain(output: string, projectId: string): Worktree[] {
  const blocks = output
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);

  return blocks.flatMap((raw, index) => {
    const block: WorktreeBlock = {};
    for (const line of raw.split('\n')) {
      const space = line.indexOf(' ');
      const key = space === -1 ? line : line.slice(0, space);
      const value = space === -1 ? '' : line.slice(space + 1);
      if (
        key in block ||
        ['worktree', 'HEAD', 'branch', 'locked', 'bare', 'detached'].includes(key)
      ) {
        block[key as keyof WorktreeBlock] = value;
      }
    }

    if (!block.worktree || block.bare !== undefined) return [];
    const branch = block.branch?.replace('refs/heads/', '') ?? '(detached)';
    return [
      {
        id: `${projectId}:${block.worktree}`,
        projectId,
        path: block.worktree,
        branch,
        head: block.HEAD ?? '',
        isMain: index === 0,
        locked: block.locked !== undefined,
      },
    ];
  });
}

export function parseNumStat(output: string): DiffStats {
  let additions = 0;
  let deletions = 0;
  let files = 0;

  for (const line of output.trim().split('\n')) {
    if (!line) continue;
    const [added, removed] = line.split('\t');
    files += 1;
    additions += added === '-' ? 0 : Number(added ?? 0);
    deletions += removed === '-' ? 0 : Number(removed ?? 0);
  }

  return { files, additions, deletions };
}

export function parseWorktreeStatus(output: string): WorktreeStatus {
  return output.trim() ? 'dirty' : 'clean';
}
