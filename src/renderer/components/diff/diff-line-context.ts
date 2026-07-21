import type { DiffFileSummary, DiffLine, DiffSession } from '../../../shared/contracts';

export interface DiffLineTarget {
  path: string;
  line: number;
  revision: string;
  side: 'old' | 'new';
}

export interface DiffLineRange {
  startLine: number;
  endLine?: number;
}

export function diffLineTarget(
  session: Pick<DiffSession, 'baseSha' | 'headSha'>,
  file: DiffFileSummary,
  line: DiffLine,
): DiffLineTarget | undefined {
  if (line.kind === 'deletion' && line.oldLine !== undefined) {
    return {
      path: file.previousPath ?? file.path,
      line: line.oldLine,
      revision: session.baseSha,
      side: 'old',
    };
  }
  if (line.newLine === undefined) return undefined;
  return {
    path: file.path,
    line: line.newLine,
    revision: session.headSha,
    side: 'new',
  };
}

export function diffLineRange(
  target: DiffLineTarget,
  selectedLines: readonly DiffLine[] | undefined,
): DiffLineRange {
  const lineNumbers = (selectedLines ?? []).flatMap((line) => {
    const lineNumber = target.side === 'old' ? line.oldLine : line.newLine;
    return lineNumber === undefined ? [] : [lineNumber];
  });
  if (!lineNumbers.includes(target.line)) return { startLine: target.line };

  const startLine = Math.min(...lineNumbers);
  const endLine = Math.max(...lineNumbers);
  return {
    startLine,
    ...(endLine === startLine ? {} : { endLine }),
  };
}

export function diffLineReference(
  target: DiffLineTarget,
  range: DiffLineRange = { startLine: target.line },
): string {
  const lines =
    range.endLine === undefined
      ? `${range.startLine}`
      : `${range.startLine}-${range.endLine}`;
  return `${target.path}:${lines}`;
}

export function diffLineCopyText(lineText: string, selection?: string): string {
  return selection?.length ? selection : lineText || ' ';
}
