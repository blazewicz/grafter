import type { CommitDetails, DiffStats, Worktree, WorktreeStatus } from './contracts';

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
        name: worktreeName(block.worktree),
        path: block.worktree,
        branch,
        head: block.HEAD ?? '',
        isMain: index === 0,
        locked: block.locked !== undefined,
      },
    ];
  });
}

function worktreeName(worktreePath: string): string {
  const normalized = worktreePath.replace(/\/+$/, '');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || worktreePath;
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

export function parseCommitDetails(output: string): CommitDetails | undefined {
  const fields = output.split('\0');
  if (fields.length !== 6) return undefined;

  const [hash, authorName, authorEmail, authoredAt, title, rawBody] = fields;
  if (!hash?.trim() || !authorName?.trim() || !authoredAt?.trim()) return undefined;
  if (Number.isNaN(Date.parse(authoredAt))) return undefined;

  return {
    hash: hash.trim(),
    title: title?.trim() ?? '',
    body: (rawBody ?? '').replace(/\n$/, ''),
    authorName: authorName.trim(),
    ...(authorEmail?.trim() ? { authorEmail: authorEmail.trim() } : {}),
    authoredAt: authoredAt.trim(),
  };
}

export function parseWorktreeStatus(output: string): WorktreeStatus {
  return output.trim() ? 'dirty' : 'clean';
}
