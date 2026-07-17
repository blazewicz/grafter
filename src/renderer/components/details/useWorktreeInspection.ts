import { useEffect, useState } from 'react';
import type { WorktreeDetails, WorktreeStatus } from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';

const worktreeStatusRefreshMs = 15_000;

export function useWorktreeInspection(
  worktreeId: string | undefined,
  onError: (message: string) => void,
): {
  details: WorktreeDetails | undefined;
  status: WorktreeStatus | undefined;
} {
  const [details, setDetails] = useState<WorktreeDetails>();
  const [statusResult, setStatusResult] = useState<{
    worktreeId: string;
    status: WorktreeStatus;
  }>();

  useEffect(() => {
    if (!worktreeId) return;
    let active = true;
    void api
      .getWorktreeDetails(worktreeId)
      .then((next) => {
        if (active) setDetails(next);
      })
      .catch((caught: unknown) => {
        if (active) onError(friendlyError(caught));
      });
    return () => {
      active = false;
    };
  }, [onError, worktreeId]);

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
        if (active) setStatusResult({ worktreeId, status: next });
      } catch (caught) {
        if (active) {
          setStatusResult((current) =>
            current?.worktreeId === worktreeId ? undefined : current,
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
  }, [onError, worktreeId]);

  return {
    details,
    status:
      statusResult && statusResult.worktreeId === worktreeId
        ? statusResult.status
        : undefined,
  };
}
