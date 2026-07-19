import { useEffect, useState } from 'react';
import type { WorktreeDetails, WorktreeStatus } from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';

const worktreeStatusRefreshMs = 15_000;

export function useWorktreeInspection(
  worktreeId: string | undefined,
  worktreeBranch: string | undefined,
  onError: (message: string) => void,
): {
  details: WorktreeDetails | undefined;
  status: WorktreeStatus | undefined;
} {
  const [details, setDetails] = useState<WorktreeDetails>();
  const [statusResult, setStatusResult] = useState<{
    worktreeId: string;
    branch: string | undefined;
    status: WorktreeStatus;
  }>();

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
          cached.targetBranch !== pullRequest.baseBranch ||
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
  }, [onError, worktreeBranch, worktreeId]);

  useEffect(() => {
    if (!worktreeId) return;

    let active = true;
    let refreshInFlight = false;
    let reportedError = false;
    let timeoutId: number | undefined;

    const clearScheduledRefresh = (): void => {
      if (timeoutId === undefined) return;
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const scheduleRefresh = (): void => {
      clearScheduledRefresh();
      if (!active || document.visibilityState !== 'visible') return;
      timeoutId = window.setTimeout(() => {
        void refreshStatus();
      }, worktreeStatusRefreshMs);
    };

    const refreshStatus = async (): Promise<void> => {
      if (!active || refreshInFlight || document.visibilityState !== 'visible') return;
      refreshInFlight = true;
      try {
        const next = await api.getWorktreeStatus(worktreeId);
        if (active) setStatusResult({ worktreeId, branch: worktreeBranch, status: next });
      } catch (caught) {
        if (active) {
          setStatusResult((current) =>
            current?.worktreeId === worktreeId && current.branch === worktreeBranch
              ? undefined
              : current,
          );
          if (!reportedError) {
            reportedError = true;
            onError(friendlyError(caught));
          }
        }
      } finally {
        refreshInFlight = false;
        scheduleRefresh();
      }
    };

    const onVisibilityChange = (): void => {
      clearScheduledRefresh();
      if (document.visibilityState === 'visible') void refreshStatus();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void refreshStatus();

    return () => {
      active = false;
      clearScheduledRefresh();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onError, worktreeBranch, worktreeId]);

  return {
    details:
      details && details.id === worktreeId && details.branch === worktreeBranch
        ? details
        : undefined,
    status:
      statusResult &&
      statusResult.worktreeId === worktreeId &&
      statusResult.branch === worktreeBranch
        ? statusResult.status
        : undefined,
  };
}
