import { useEffect, useState } from 'react';
import type { WorktreeDetails } from '../../shared/contracts';
import { api, friendlyError } from '../grafter-api';

export function useWorktreeInspection(
  worktreeId: string | undefined,
  worktreeBranch: string | undefined,
  worktreeHead: string | undefined,
  onError: (message: string) => void,
): {
  details: WorktreeDetails | undefined;
} {
  const [details, setDetails] = useState<WorktreeDetails>();

  useEffect(() => {
    if (!worktreeId) return;
    let active = true;

    const inspect = async (): Promise<void> => {
      const pullRequestRefresh = api.refreshPullRequest(worktreeId).then(
        (pullRequest) => ({ ok: true as const, pullRequest }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      try {
        const cached = await api.getWorktreeDetails(worktreeId);
        if (!active) return;
        setDetails(cached);

        const refreshResult = await pullRequestRefresh;
        if (!refreshResult.ok) throw refreshResult.error;
        const { pullRequest } = refreshResult;
        if (!active || !pullRequest) return;

        if (
          cached.automaticBaseBranch !== pullRequest.baseBranch ||
          cached.pullRequest === undefined
        ) {
          const refreshed = await api.getWorktreeDetails(worktreeId);
          if (active) setDetails(refreshed);
        } else {
          setDetails((current) =>
            current?.id === worktreeId ? { ...current, pullRequest } : current,
          );
        }
      } catch (caught) {
        if (active) onError(friendlyError(caught));
      }
    };

    void inspect();
    return () => {
      active = false;
    };
  }, [onError, worktreeBranch, worktreeHead, worktreeId]);

  return {
    details:
      details &&
      details.id === worktreeId &&
      details.branch === worktreeBranch &&
      details.head === worktreeHead
        ? details
        : undefined,
  };
}
