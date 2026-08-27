import type { DiffSession } from '../shared/contracts';

/**
 * Stable identity of a diff window's content, used to dedupe open windows:
 * opening the exact same diff again focuses the existing window.
 *
 * The identity includes the commit range so a branch pair whose history moved
 * gets its own window instead of silently focusing one showing stale commits
 * and discarding the freshly computed diff. Commit hashes are immutable, so
 * commit sessions key on the hash alone.
 *
 * The identity is an encoded tuple so branch names containing the separator
 * cannot collide with a differently-partitioned pair.
 */
export function diffWindowKey(session: DiffSession): string {
  if (session.kind === 'branch') {
    return JSON.stringify([
      session.projectId,
      'branch',
      session.branch,
      session.targetBranch,
      session.baseSha,
      session.headSha,
    ]);
  }
  return JSON.stringify([session.projectId, 'commit', session.headSha]);
}
