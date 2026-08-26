import { useState } from 'react';
import type { GrafterApi, OpenDiffWindowRequest } from '../../shared/contracts';
import { friendlyError } from '../grafter-api';

/**
 * Opens diffs as independent floating windows from the repository window.
 * Session ownership lives in the main process afterwards.
 */
export function useDiffWindowLauncher(
  api: Pick<GrafterApi, 'openDiffWindow'>,
  onError: (message: string) => void,
): {
  opening: boolean;
  openWorktreeDiff: (worktreeId: string) => void;
  openCommitDiff: (commitHash: string) => void;
} {
  const [opening, setOpening] = useState(false);

  const open = (request: OpenDiffWindowRequest): void => {
    setOpening(true);
    void api
      .openDiffWindow(request)
      .catch((caught: unknown) => onError(friendlyError(caught)))
      .finally(() => setOpening(false));
  };

  return {
    opening,
    openWorktreeDiff: (worktreeId) => open({ kind: 'worktree', worktreeId }),
    openCommitDiff: (commitHash) => open({ kind: 'commit', commitHash }),
  };
}
