import { describe, expect, it } from 'vitest';
import type { CommandRecord } from '../src/shared/contracts';
import {
  combineCommandRecords,
  filterAuditCommandGroups,
  groupConsecutiveReadOnlyCommands,
  mergeCommandRecord,
  summarizeRunningCommands,
  transitionRunningCommandDisplay,
} from '../src/renderer/command-audit';

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

  it('keeps each displayed command visible for the minimum interval', () => {
    const first = command('first', { status: 'running' });
    const latest = command('latest', {
      status: 'running',
      startedAt: '2026-07-17T10:00:01.000Z',
    });
    const initial = transitionRunningCommandDisplay(
      { command: undefined, shownAt: undefined },
      first,
      100,
      800,
    ).display;
    const throttled = transitionRunningCommandDisplay(initial, latest, 500, 800);

    expect(throttled).toEqual({ display: initial, waitMs: 400 });
    expect(transitionRunningCommandDisplay(initial, latest, 900, 800).display).toEqual({
      command: latest,
      shownAt: 900,
    });
  });

  it('holds the final label until its minimum display time has elapsed', () => {
    const running = command('running', { status: 'running' });
    const display = { command: running, shownAt: 100 };

    expect(transitionRunningCommandDisplay(display, undefined, 600, 800)).toEqual({
      display,
      waitMs: 300,
    });
    expect(transitionRunningCommandDisplay(display, undefined, 900, 800).display).toEqual(
      { command: undefined, shownAt: undefined },
    );
  });
});
