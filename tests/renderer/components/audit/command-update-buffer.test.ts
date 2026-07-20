import { describe, expect, it, vi } from 'vitest';
import type { CommandRecord } from '../../../../src/shared/contracts';
import {
  CommandUpdateBuffer,
  type CommandUpdateScheduler,
} from '../../../../src/renderer/components/audit/CommandUpdateBuffer';

function command(
  status: CommandRecord['status'],
  output: CommandRecord['output'] = [],
): CommandRecord {
  return {
    id: 'command',
    context: { kind: 'project', projectId: 'project' },
    tool: 'git',
    executable: 'git',
    args: ['status'],
    cwd: '/repo',
    displayCommand: 'git status',
    purpose: 'Check status',
    isReadOnly: true,
    status,
    requiresApproval: false,
    startedAt: '2026-07-20T12:00:00.000Z',
    output,
  };
}

function scheduler(): CommandUpdateScheduler {
  return {
    schedule: (callback, delayMs) => Number(setTimeout(callback, delayMs)),
    cancel: (handle) => clearTimeout(handle),
  };
}

describe('CommandUpdateBuffer', () => {
  it('coalesces rapid lifecycle updates into the latest record', () => {
    vi.useFakeTimers();
    const flushed: CommandRecord[] = [];
    const buffer = new CommandUpdateBuffer((record) => flushed.push(record), scheduler());
    const completed = command('succeeded', [
      {
        stream: 'stdout',
        text: 'clean\n',
        timestamp: '2026-07-20T12:00:00.010Z',
      },
    ]);

    buffer.enqueue(command('running'));
    buffer.enqueue(completed);
    vi.advanceTimersByTime(99);
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(flushed).toEqual([completed]);

    buffer.dispose();
    vi.useRealTimers();
  });

  it('flushes approval and failure states immediately', () => {
    vi.useFakeTimers();
    const flushed: CommandRecord[] = [];
    const buffer = new CommandUpdateBuffer((record) => flushed.push(record), scheduler());
    const failed = command('failed');

    buffer.enqueue(command('running'));
    buffer.enqueue(failed);
    expect(flushed).toEqual([failed]);
    vi.runAllTimers();
    expect(flushed).toEqual([failed]);

    buffer.enqueue(command('awaiting-approval'));
    expect(flushed.at(-1)?.status).toBe('awaiting-approval');

    buffer.dispose();
    vi.useRealTimers();
  });

  it('cancels pending updates when disposed', () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const buffer = new CommandUpdateBuffer(flush, scheduler());

    buffer.enqueue(command('running'));
    buffer.dispose();
    vi.runAllTimers();

    expect(flush).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
