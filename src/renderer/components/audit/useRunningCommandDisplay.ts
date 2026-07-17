import { useEffect, useState } from 'react';
import type { CommandRecord } from '../../../shared/contracts';
import {
  transitionRunningCommandDisplay,
  type RunningCommandDisplay,
} from '../../command-audit';

export function useRunningCommandDisplay(
  latest: CommandRecord | undefined,
): RunningCommandDisplay['command'] {
  const [display, setDisplay] = useState<RunningCommandDisplay>({
    command: undefined,
    shownAt: undefined,
  });
  const latestId = latest?.id;
  const latestPurpose = latest?.purpose;

  useEffect(() => {
    const latestLabel =
      latestId === undefined ? undefined : { id: latestId, purpose: latestPurpose ?? '' };
    const transition = transitionRunningCommandDisplay(display, latestLabel, Date.now());
    if (transition.display === display && transition.waitMs === undefined) return;

    const timeoutId = window.setTimeout(() => {
      setDisplay(
        (current) =>
          transitionRunningCommandDisplay(current, latestLabel, Date.now()).display,
      );
    }, transition.waitMs ?? 0);
    return () => window.clearTimeout(timeoutId);
  }, [display, latestId, latestPurpose]);

  return display.command;
}
