import type { DiffSession } from '../shared/contracts';

/**
 * Stable identity of a diff session content, used to dedupe open diff windows:
 * opening the same branch pair or commit again focuses the existing window.
 */
export function diffWindowKey(session: DiffSession): string {
  if (session.kind === 'branch') {
    return `${session.projectId}|branch|${session.branch}|${session.targetBranch}`;
  }
  return `${session.projectId}|commit|${session.headSha}`;
}
