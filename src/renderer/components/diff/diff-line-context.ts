import type { DiffFileSummary, DiffLine, DiffSession } from '../../../shared/contracts';

export interface DiffLineTarget {
  path: string;
  line: number;
  revision: string;
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
    };
  }
  if (line.newLine === undefined) return undefined;
  return { path: file.path, line: line.newLine, revision: session.headSha };
}

export function diffLineReference(target: DiffLineTarget): string {
  return `${target.path}:${target.line}`;
}

export function diffLineCopyText(lineText: string, selection?: string): string {
  return selection?.length ? selection : lineText || ' ';
}
