import type { CommandRecord, ToolName } from '../shared/contracts';

export const runningCommandMinimumDisplayMs = 800;

export interface RunningCommandSummary {
  latest: CommandRecord | undefined;
  count: number;
}

export interface AuditCommandGroup {
  id: string;
  latest: CommandRecord;
  calls: CommandRecord[];
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

export function combineCommandRecords(
  fetched: CommandRecord[],
  live: CommandRecord[],
): CommandRecord[] {
  const records = new Map(fetched.map((record) => [record.id, record]));
  for (const record of live) records.set(record.id, record);
  return [...records.values()].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );
}

export function filterAuditCommandGroups(
  groups: AuditCommandGroup[],
  tool: ToolName,
  hideReadOnly: boolean,
): AuditCommandGroup[] {
  return groups.filter(
    (group) =>
      group.latest.tool === tool && (!hideReadOnly || group.latest.isReadOnly === false),
  );
}

export function groupConsecutiveReadOnlyCommands(
  commands: CommandRecord[],
): AuditCommandGroup[] {
  const groups: AuditCommandGroup[] = [];

  for (const command of commands) {
    const previous = groups.at(-1);
    if (
      previous &&
      isGroupableReadOnlyCommand(previous.latest) &&
      isGroupableReadOnlyCommand(command) &&
      isSameCommand(previous.latest, command)
    ) {
      previous.calls.push(command);
      continue;
    }

    groups.push({ id: command.id, latest: command, calls: [command] });
  }

  return groups;
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

function isGroupableReadOnlyCommand(command: CommandRecord): boolean {
  return (
    command.isReadOnly &&
    command.status === 'succeeded' &&
    command.requiresApproval === false
  );
}

function isSameCommand(left: CommandRecord, right: CommandRecord): boolean {
  return (
    left.tool === right.tool &&
    left.executable === right.executable &&
    left.cwd === right.cwd &&
    left.args.length === right.args.length &&
    left.args.every((argument, index) => argument === right.args[index])
  );
}
