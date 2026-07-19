import { useEffect } from 'react';
import type { AppSnapshot } from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';

const projectWorktreeRefreshMs = 15_000;

export function useProjectWorktreeRefresh(
  projectId: string | undefined,
  onRefresh: (snapshot: AppSnapshot) => void,
  onError: (message: string) => void,
): void {
  useEffect(() => {
    if (!projectId) return;

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
        void refreshProject();
      }, projectWorktreeRefreshMs);
    };

    const refreshProject = async (): Promise<void> => {
      if (!active || refreshInFlight || document.visibilityState !== 'visible') return;
      refreshInFlight = true;
      try {
        const snapshot = await api.refreshProject(projectId);
        if (active) onRefresh(snapshot);
      } catch (caught) {
        if (active && !reportedError) {
          reportedError = true;
          onError(friendlyError(caught));
        }
      } finally {
        refreshInFlight = false;
        scheduleRefresh();
      }
    };

    const onVisibilityChange = (): void => {
      clearScheduledRefresh();
      if (document.visibilityState === 'visible') void refreshProject();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void refreshProject();

    return () => {
      active = false;
      clearScheduledRefresh();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onError, onRefresh, projectId]);
}
