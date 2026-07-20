import { describe, expect, it } from 'vitest';
import type { CommandRecord } from '../../src/shared/contracts';
import {
  commandActivityHideDelay,
  commandStatusLabel,
  combineCommandRecords,
  filterAuditCommandGroups,
  groupConsecutiveReadOnlyCommands,
  mergeCommandRecord,
  summarizeRunningCommands,
} from '../../src/renderer/command-audit';

function command(id: string, overrides: Partial<CommandRecord> = {}): CommandRecord {
  return {
    id,
    context: {
      kind: 'worktree',
      projectId: 'project',
      worktreeId: 'worktree',
    },
    tool: 'git',
    executable: 'git',
    args: ['status'],
    cwd: '/repo',
    displayCommand: 'git status',
    purpose: `Command ${id}`,
    isReadOnly: true,
    status: 'succeeded',
    requiresApproval: false,
    startedAt: '2026-07-17T10:00:00.000Z',
    output: [],
    ...overrides,
  };
}

describe('command audit filtering', () => {
  it('hides read-only commands only when the filter is enabled', () => {
    const commands = [
      command('read'),
      command('write', { isReadOnly: false }),
      command('github', { tool: 'github' }),
    ];

    const groups = groupConsecutiveReadOnlyCommands(commands);

    expect(filterAuditCommandGroups(groups, 'git', false).map(({ id }) => id)).toEqual([
      'read',
      'write',
    ]);
    expect(filterAuditCommandGroups(groups, 'git', true).map(({ id }) => id)).toEqual([
      'write',
    ]);
  });

  it('shows commands from every tool when all tools are selected', () => {
    const commands = [
      command('git'),
      command('github', { tool: 'github' }),
      command('shell', { tool: 'shell', isReadOnly: false }),
    ];

    const groups = groupConsecutiveReadOnlyCommands(commands);

    expect(filterAuditCommandGroups(groups, 'all', false).map(({ id }) => id)).toEqual([
      'git',
      'github',
      'shell',
    ]);
    expect(filterAuditCommandGroups(groups, 'all', true).map(({ id }) => id)).toEqual([
      'shell',
    ]);
  });

  it('replaces live updates without changing command start order', () => {
    const original = command('first', { status: 'running' });
    const newer = command('newer', {
      status: 'running',
      startedAt: '2026-07-17T10:00:01.000Z',
    });
    const updated = { ...original, output: [] };

    expect(mergeCommandRecord([newer, original], updated)).toEqual([newer, updated]);
  });

  it('combines a fetched log with newer live updates without losing either', () => {
    const fetched = [command('existing'), command('older')];
    const updated = command('existing', { status: 'running' });
    const live = [command('new', { startedAt: '2026-07-17T10:00:02.000Z' }), updated];

    expect(combineCommandRecords(fetched, live)).toEqual([live[0], updated, fetched[1]]);
  });
});

describe('command status labels', () => {
  it('formats successful and failed durations to two decimal places', () => {
    expect(commandStatusLabel(command('success', { durationMs: 12.3456 }))).toBe(
      'Succeeded in 12.35 ms',
    );
    expect(
      commandStatusLabel(command('failure', { status: 'failed', durationMs: 987.6543 })),
    ).toBe('Failed in 987.65 ms');
  });

  it('keeps non-executed and active statuses free of durations', () => {
    expect(
      commandStatusLabel(
        command('approval', { status: 'awaiting-approval', durationMs: 10 }),
      ),
    ).toBe('Awaiting approval');
    expect(
      commandStatusLabel(command('running', { status: 'running', durationMs: 10 })),
    ).toBe('Running');
    expect(commandStatusLabel(command('legacy'))).toBe('Succeeded');
  });
});

describe('command audit grouping', () => {
  it('groups consecutive identical successful read-only commands newest first', () => {
    const latest = command('latest', {
      startedAt: '2026-07-17T10:00:02.000Z',
      output: [
        { stream: 'stdout', text: 'latest', timestamp: '2026-07-17T10:00:02.100Z' },
      ],
    });
    const older = command('older', {
      startedAt: '2026-07-17T10:00:01.000Z',
      output: [
        { stream: 'stdout', text: 'older', timestamp: '2026-07-17T10:00:01.100Z' },
      ],
    });

    expect(groupConsecutiveReadOnlyCommands([latest, older])).toEqual([
      { id: older.id, latest, calls: [latest, older] },
    ]);
  });

  it('keeps group identity stable while a new read-only call runs and succeeds', () => {
    const oldest = command('oldest');
    const previous = command('previous', {
      startedAt: '2026-07-17T10:00:01.000Z',
    });
    const running = command('running', {
      status: 'running',
      startedAt: '2026-07-17T10:00:02.000Z',
    });
    const succeeded = { ...running, status: 'succeeded' as const };

    const before = groupConsecutiveReadOnlyCommands([previous, oldest]);
    const during = groupConsecutiveReadOnlyCommands([running, previous, oldest]);
    const after = groupConsecutiveReadOnlyCommands([succeeded, previous, oldest]);

    expect(before[0]?.id).toBe(oldest.id);
    expect(during).toEqual([
      { id: oldest.id, latest: running, calls: [running, previous, oldest] },
    ]);
    expect(after).toEqual([
      { id: oldest.id, latest: succeeded, calls: [succeeded, previous, oldest] },
    ]);
  });

  it('splits a provisionally grouped call out if it fails', () => {
    const older = command('older');
    const failed = command('failed', {
      status: 'failed',
      startedAt: '2026-07-17T10:00:01.000Z',
    });

    expect(
      groupConsecutiveReadOnlyCommands([failed, older]).map((group) =>
        group.calls.map(({ id }) => id),
      ),
    ).toEqual([['failed'], ['older']]);
  });

  it('does not group identical commands across an intervening entry', () => {
    const latest = command('latest');
    const intervening = command('intervening', { args: ['branch'] });
    const older = command('older');

    expect(
      groupConsecutiveReadOnlyCommands([latest, intervening, older]).map((group) =>
        group.calls.map(({ id }) => id),
      ),
    ).toEqual([['latest'], ['intervening'], ['older']]);
  });

  it.each([
    ['mutating', { isReadOnly: false }],
    ['failed', { status: 'failed' as const }],
    ['approval-bound', { requiresApproval: true }],
  ])('keeps %s command attempts separate', (_label, overrides) => {
    const latest = command('latest', overrides);
    const older = command('older', overrides);

    expect(
      groupConsecutiveReadOnlyCommands([latest, older]).map((group) =>
        group.calls.map(({ id }) => id),
      ),
    ).toEqual([['latest'], ['older']]);
  });

  it('uses executable, arguments, working directory, and tool as command identity', () => {
    const baseline = command('baseline');
    const changedArgument = command('argument', { args: ['status', '--short'] });
    const changedDirectory = command('directory', { cwd: '/other-repo' });
    const changedTool = command('tool', { tool: 'github' });

    expect(
      groupConsecutiveReadOnlyCommands([
        baseline,
        changedArgument,
        changedDirectory,
        changedTool,
      ]),
    ).toHaveLength(4);
  });
});

describe('running command activity', () => {
  it('selects the latest-started command across all tools and counts all running', () => {
    const commands = [
      command('older', { status: 'running' }),
      command('completed'),
      command('latest', {
        tool: 'shell',
        isReadOnly: false,
        status: 'running',
        startedAt: '2026-07-17T10:00:02.000Z',
      }),
    ];

    expect(summarizeRunningCommands(commands)).toEqual({
      latest: commands[2],
      count: 2,
    });
  });

  it('keeps running and approval activity visible', () => {
    expect(
      commandActivityHideDelay(command('running', { status: 'running' }), 100, 900),
    ).toBeUndefined();
    expect(
      commandActivityHideDelay(
        command('approval', { status: 'awaiting-approval' }),
        100,
        900,
      ),
    ).toBeUndefined();
  });

  it('holds completed activity for the remaining minimum interval', () => {
    const completed = command('completed');

    expect(commandActivityHideDelay(completed, 100, 600, 1_500)).toBe(1_000);
    expect(commandActivityHideDelay(completed, 100, 1_700, 1_500)).toBe(0);
  });
});
