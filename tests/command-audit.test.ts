import { describe, expect, it } from 'vitest';
import type { CommandRecord } from '../src/shared/contracts';
import {
  combineCommandRecords,
  filterAuditCommands,
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

    expect(filterAuditCommands(commands, 'git', false).map(({ id }) => id)).toEqual([
      'read',
      'write',
    ]);
    expect(filterAuditCommands(commands, 'git', true).map(({ id }) => id)).toEqual([
      'write',
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
