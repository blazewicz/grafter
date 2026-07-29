import { useState } from 'react';
import type { GrafterApi, DiffSession } from '../../shared/contracts';
import { friendlyError } from '../grafter-api';

export function useDiffViewer(
  api: Pick<GrafterApi, 'openDiff' | 'openCommitDiff' | 'closeDiff'>,
  onError: (message: string) => void,
): {
  diffSession: DiffSession | undefined;
  diffOpening: boolean;
  openDiff: (worktreeId: string) => void;
  openCommitDiff: (projectId: string, commitHash: string) => void;
  closeDiff: () => void;
  replaceDiffSession: (next: DiffSession) => void;
} {
  const [diffSession, setDiffSession] = useState<DiffSession>();
  const [diffOpening, setDiffOpening] = useState(false);

  const openDiff = (worktreeId: string): void => {
    setDiffOpening(true);
    void api
      .openDiff(worktreeId)
      .then(setDiffSession)
      .catch((caught: unknown) => onError(friendlyError(caught)))
      .finally(() => setDiffOpening(false));
  };

  const openCommitDiff = (projectId: string, commitHash: string): void => {
    setDiffOpening(true);
    void api
      .openCommitDiff({ projectId, commitHash })
      .then(setDiffSession)
      .catch((caught: unknown) => onError(friendlyError(caught)))
      .finally(() => setDiffOpening(false));
  };

  const closeDiff = (): void => {
    const sessionId = diffSession?.id;
    setDiffSession(undefined);
    if (!sessionId) return;
    void api
      .closeDiff(sessionId)
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  const replaceDiffSession = (next: DiffSession): void => {
    const previousId = diffSession?.id;
    setDiffSession(next);
    if (!previousId || previousId === next.id) return;
    void api
      .closeDiff(previousId)
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  return {
    diffSession,
    diffOpening,
    openDiff,
    openCommitDiff,
    closeDiff,
    replaceDiffSession,
  };
}
