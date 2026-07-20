import type { CommandRecord, ToolName } from '../shared/contracts';

export const commandActivityMinimumVisibleMs = 1_500;

export interface RunningCommandSummary {
  latest: CommandRecord | undefined;
  count: number;
}

export interface AuditCommandGroup {
  id: string;
  latest: CommandRecord;
  calls: CommandRecord[];
}

export type AuditToolFilter = ToolName | 'all';

export type CommandActivityLabel = Pick<CommandRecord, 'id' | 'purpose' | 'status'>;

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
  tool: AuditToolFilter,
  hideReadOnly: boolean,
): AuditCommandGroup[] {
  return groups.filter(
    (group) =>
      (tool === 'all' || group.latest.tool === tool) &&
      (!hideReadOnly || group.latest.isReadOnly === false),
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
      previous.id = command.id;
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

export function commandStatusLabel(command: CommandRecord): string {
  if (command.status === 'awaiting-approval') return 'Awaiting approval';

  const status = `${command.status.charAt(0).toUpperCase()}${command.status.slice(1)}`;
  if (
    (command.status === 'succeeded' || command.status === 'failed') &&
    command.durationMs !== undefined
  ) {
    return `${status} in ${command.durationMs.toFixed(2)} ms`;
  }
  return status;
}

export function commandActivityHideDelay(
  command: CommandActivityLabel,
  shownAt: number,
  now: number,
  minimumVisibleMs = commandActivityMinimumVisibleMs,
): number | undefined {
  if (command.status === 'running' || command.status === 'awaiting-approval') {
    return undefined;
  }
  return Math.max(0, minimumVisibleMs - (now - shownAt));
}

function isGroupableReadOnlyCommand(command: CommandRecord): boolean {
  return (
    command.isReadOnly &&
    (command.status === 'running' || command.status === 'succeeded') &&
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
