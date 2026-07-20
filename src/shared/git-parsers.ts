import type {
  CommitDetails,
  DiffFilePatch,
  DiffFileStatus,
  DiffFileSummary,
  DiffStats,
  Worktree,
  WorktreeStatus,
} from './contracts';
import {
  resolveWorktreeDisplayNames,
  type WorktreeWithoutDisplayName,
} from './worktree-list';

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

  const worktrees = blocks.flatMap<WorktreeWithoutDisplayName>((raw, index) => {
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

  return resolveWorktreeDisplayNames(worktrees);
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

interface ParsedNumStat {
  path: string;
  previousPath?: string;
  additions?: number;
  deletions?: number;
  binary: boolean;
}

export function parseDiffFiles(
  nameStatusOutput: string,
  numStatOutput: string,
): DiffFileSummary[] {
  const stats = new Map(
    parseNullDelimitedNumStat(numStatOutput).map((item) => [
      diffPathKey(item.path, item.previousPath),
      item,
    ]),
  );
  const fields = trimTrailingEmptyField(nameStatusOutput.split('\0'));
  const files: DiffFileSummary[] = [];

  for (let index = 0; index < fields.length;) {
    const rawStatus = fields[index++];
    if (!rawStatus) continue;
    const statusCode = rawStatus[0];
    const hasPreviousPath = statusCode === 'R' || statusCode === 'C';
    const previousPath = hasPreviousPath ? fields[index++] : undefined;
    const filePath = fields[index++];
    if (!filePath || (hasPreviousPath && !previousPath)) break;

    const parsedStats = stats.get(diffPathKey(filePath, previousPath));
    files.push({
      id: `file-${files.length}`,
      path: filePath,
      ...(previousPath ? { previousPath } : {}),
      status: diffFileStatus(statusCode),
      ...(parsedStats?.additions !== undefined
        ? { additions: parsedStats.additions }
        : {}),
      ...(parsedStats?.deletions !== undefined
        ? { deletions: parsedStats.deletions }
        : {}),
      binary: parsedStats?.binary ?? false,
    });
  }

  return files;
}

export function parseUnifiedDiff(fileId: string, output: string): DiffFilePatch {
  const hunks: DiffFilePatch['hunks'] = [];
  let current: DiffFilePatch['hunks'][number] | undefined;
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining = 0;
  let newRemaining = 0;

  for (const rawLine of output.split('\n')) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(rawLine);
    if (match) {
      const oldStart = Number(match[1]);
      const oldLines = Number(match[2] ?? 1);
      const newStart = Number(match[3]);
      const newLines = Number(match[4] ?? 1);
      current = {
        header: rawLine,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
      };
      hunks.push(current);
      oldLine = oldStart;
      newLine = newStart;
      oldRemaining = oldLines;
      newRemaining = newLines;
      continue;
    }
    if (!current) continue;

    if (rawLine.startsWith('\\ ')) {
      current.lines.push({ kind: 'annotation', text: rawLine.slice(2) });
      continue;
    }
    if (oldRemaining === 0 && newRemaining === 0) continue;

    const prefix = rawLine[0];
    const text = rawLine.slice(1);
    if (prefix === ' ' && oldRemaining > 0 && newRemaining > 0) {
      current.lines.push({
        kind: 'context',
        text,
        oldLine,
        newLine,
      });
      oldLine += 1;
      newLine += 1;
      oldRemaining -= 1;
      newRemaining -= 1;
    } else if (prefix === '-' && oldRemaining > 0) {
      current.lines.push({ kind: 'deletion', text, oldLine });
      oldLine += 1;
      oldRemaining -= 1;
    } else if (prefix === '+' && newRemaining > 0) {
      current.lines.push({ kind: 'addition', text, newLine });
      newLine += 1;
      newRemaining -= 1;
    }
  }

  return { fileId, binary: false, hunks };
}

function parseNullDelimitedNumStat(output: string): ParsedNumStat[] {
  const fields = trimTrailingEmptyField(output.split('\0'));
  const stats: ParsedNumStat[] = [];

  for (let index = 0; index < fields.length;) {
    const header = fields[index++];
    if (!header) continue;
    const firstTab = header.indexOf('\t');
    const secondTab = header.indexOf('\t', firstTab + 1);
    if (firstTab === -1 || secondTab === -1) break;

    const added = header.slice(0, firstTab);
    const deleted = header.slice(firstTab + 1, secondTab);
    const inlinePath = header.slice(secondTab + 1);
    const previousPath = inlinePath ? undefined : fields[index++];
    const filePath = inlinePath || fields[index++];
    if (!filePath || (!inlinePath && !previousPath)) break;
    const binary = added === '-' || deleted === '-';

    stats.push({
      path: filePath,
      ...(previousPath ? { previousPath } : {}),
      ...(binary ? {} : { additions: Number(added), deletions: Number(deleted) }),
      binary,
    });
  }

  return stats;
}

function trimTrailingEmptyField(fields: string[]): string[] {
  return fields.at(-1) === '' ? fields.slice(0, -1) : fields;
}

function diffPathKey(filePath: string, previousPath?: string): string {
  return `${previousPath ?? ''}\0${filePath}`;
}

function diffFileStatus(code: string | undefined): DiffFileStatus {
  if (code === 'A') return 'added';
  if (code === 'C') return 'copied';
  if (code === 'D') return 'deleted';
  if (code === 'R') return 'renamed';
  if (code === 'T') return 'type-changed';
  return 'modified';
}

export function parseCommitDetails(output: string): CommitDetails | undefined {
  const sections = output.split('\0');
  if (sections.length !== 2) return undefined;

  const [rawMetadata, rawStats] = sections;
  const [hash, authorName, authorEmail, authoredAt, title, ...bodyLines] = (
    rawMetadata ?? ''
  ).split('\n');
  if (!hash?.trim() || !authorName?.trim() || !authoredAt?.trim()) return undefined;
  if (Number.isNaN(Date.parse(authoredAt))) return undefined;

  return {
    hash: hash.trim(),
    title: title?.trim() ?? '',
    body: bodyLines.join('\n').replace(/\n+$/, ''),
    authorName: authorName.trim(),
    ...(authorEmail?.trim() ? { authorEmail: authorEmail.trim() } : {}),
    authoredAt: authoredAt.trim(),
    stats: parseNumStat((rawStats ?? '').replace(/^\n+/, '')),
  };
}

export function parseWorktreeStatus(output: string): WorktreeStatus {
  return output.trim() ? 'dirty' : 'clean';
}
