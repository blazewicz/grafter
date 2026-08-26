import type { DiffSession } from '../shared/contracts';

/**
 * Stable identity of a diff session content, used to dedupe open diff windows:
 * opening the same branch pair or commit again focuses the existing window.
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
    ]);
  }
  return JSON.stringify([session.projectId, 'commit', session.headSha]);
}
