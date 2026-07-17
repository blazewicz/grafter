import type { CommandRecord, ToolName } from '../shared/contracts';

export const runningCommandMinimumDisplayMs = 800;

export interface RunningCommandSummary {
  latest: CommandRecord | undefined;
  count: number;
}

export type RunningCommandLabel = Pick<CommandRecord, 'id' | 'purpose'>;

export interface RunningCommandDisplay {
  command: RunningCommandLabel | undefined;
  shownAt: number | undefined;
}

export interface RunningCommandDisplayTransition {
  display: RunningCommandDisplay;
  waitMs?: number;
}

export function mergeCommandRecord(
  commands: CommandRecord[],
  record: CommandRecord,
): CommandRecord[] {
  const existingIndex = commands.findIndex((command) => command.id === record.id);
  if (existingIndex === -1) return [record, ...commands];
  return commands.map((command, index) => (index === existingIndex ? record : command));
}

export function filterAuditCommands(
  commands: CommandRecord[],
  tool: ToolName,
  hideReadOnly: boolean,
): CommandRecord[] {
  return commands.filter(
    (command) => command.tool === tool && (!hideReadOnly || command.isReadOnly === false),
  );
}

export function summarizeRunningCommands(
  commands: CommandRecord[],
): RunningCommandSummary {
  let latest: CommandRecord | undefined;
  let count = 0;

  for (const command of commands) {
    if (command.status !== 'running') continue;
    count += 1;
    if (!latest || command.startedAt > latest.startedAt) latest = command;
  }

  return { latest, count };
}

export function transitionRunningCommandDisplay(
  current: RunningCommandDisplay,
  latest: RunningCommandLabel | undefined,
  now: number,
  minimumDisplayMs = runningCommandMinimumDisplayMs,
): RunningCommandDisplayTransition {
  if (current.command?.id === latest?.id) return { display: current };

  if (!current.command) {
    if (!latest) return { display: current };
    return { display: { command: latest, shownAt: now } };
  }

  const shownAt = current.shownAt ?? now;
  const waitMs = minimumDisplayMs - (now - shownAt);
  if (waitMs > 0) return { display: current, waitMs };

  return {
    display: latest
      ? { command: latest, shownAt: now }
      : { command: undefined, shownAt: undefined },
  };
}
