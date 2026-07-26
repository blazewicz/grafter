import type { DiffFileSummary, DiffStats } from '../../src/shared/contracts';
import { diffStatsFactory } from './diff-stats';

export function buildDiffSessionStats(files: readonly DiffFileSummary[]): DiffStats {
  return diffStatsFactory.build({
    files: files.length,
    additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
    deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
  });
}

export function validateDiffSessionStats(
  files: readonly DiffFileSummary[],
  stats: DiffStats,
): void {
  const expected = buildDiffSessionStats(files);
  if (
    stats.files !== expected.files ||
    stats.additions !== expected.additions ||
    stats.deletions !== expected.deletions
  ) {
    throw new Error('Diff session stats must match its file summaries.');
  }
}
