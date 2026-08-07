import { useEffect } from 'react';
import type { AppSnapshot } from '../../shared/contracts';
import { api, friendlyError } from '../grafter-api';

const repositoryRefreshMs = 15_000;

export function useRepositoryRefresh(
  repositoryOpen: boolean,
  onRefresh: (snapshot: AppSnapshot) => void,
  onError: (message: string) => void,
): void {
  useEffect(() => {
    if (!repositoryOpen) return;

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
        void refreshRepository();
      }, repositoryRefreshMs);
    };

    const refreshRepository = async (): Promise<void> => {
      if (!active || refreshInFlight || document.visibilityState !== 'visible') return;
      refreshInFlight = true;
      try {
        const snapshot = await api.refresh();
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
      if (document.visibilityState === 'visible') void refreshRepository();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void refreshRepository();

    return () => {
      active = false;
      clearScheduledRefresh();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onError, onRefresh, repositoryOpen]);
}
