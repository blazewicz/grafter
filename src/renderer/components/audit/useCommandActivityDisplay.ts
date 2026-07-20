import { useEffect, useState } from 'react';
import type { CommandRecord } from '../../../shared/contracts';
import { commandActivityHideDelay, type CommandActivityLabel } from '../../command-audit';

export const commandActivityExitMs = 900;

export interface CommandActivityDisplay {
  command: CommandActivityLabel | undefined;
  visible: boolean;
  shownAt: number | undefined;
}

export function useCommandActivityDisplay(
  latest: CommandRecord | undefined,
): CommandActivityDisplay {
  const [display, setDisplay] = useState<CommandActivityDisplay>({
    command: undefined,
    visible: false,
    shownAt: undefined,
  });
  const latestId = latest?.id;
  const latestPurpose = latest?.purpose;
  const latestStatus = latest?.status;

  useEffect(() => {
    if (!latestId || !latestStatus) return;
    const command: CommandActivityLabel = {
      id: latestId,
      purpose: latestPurpose ?? '',
      status: latestStatus,
    };
    const timeoutId = window.setTimeout(() => {
      setDisplay((current) => {
        if (
          current.command?.id === command.id &&
          current.command.purpose === command.purpose &&
          current.command.status === command.status
        ) {
          return current;
        }
        if (current.command?.id === command.id) {
          return { ...current, command, visible: true };
        }
        return { command, visible: true, shownAt: Date.now() };
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [latestId, latestPurpose, latestStatus]);

  useEffect(() => {
    if (!display.command || display.shownAt === undefined) return;

    if (!display.visible) {
      const timeoutId = window.setTimeout(() => {
        setDisplay((current) =>
          current.command?.id === display.command?.id && !current.visible
            ? { command: undefined, visible: false, shownAt: undefined }
            : current,
        );
      }, commandActivityExitMs);
      return () => window.clearTimeout(timeoutId);
    }

    const waitMs = commandActivityHideDelay(display.command, display.shownAt, Date.now());
    if (waitMs === undefined) return;

    const timeoutId = window.setTimeout(() => {
      setDisplay((current) =>
        current.command?.id === display.command?.id
          ? { ...current, visible: false }
          : current,
      );
    }, waitMs);
    return () => window.clearTimeout(timeoutId);
  }, [display]);

  return display;
}
