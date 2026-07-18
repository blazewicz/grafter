import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApprovalManager } from '../../src/main/approvals';
import { CommandRunner } from '../../src/main/commands';
import type { CommandSpec } from '../../src/main/commands';

const command: CommandSpec = {
  context: { kind: 'project', projectId: 'project' },
  tool: 'git',
  executable: 'git',
  args: ['worktree', 'remove', '/repo.worktrees/feature'],
  cwd: '/repo',
  purpose: 'Remove worktree',
  isReadOnly: false,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('ApprovalManager', () => {
  it('marks an expired approval as declined in the command audit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T10:00:00Z'));
    const runner = new CommandRunner(() => undefined);
    const approvals = new ApprovalManager(runner);
    const request = approvals.prepare(command, 'Review this command.');

    vi.advanceTimersByTime(5 * 60_000 + 1);

    expect(() => approvals.reject(request.approvalId)).toThrow(
      'This approval request expired. Please start the action again.',
    );
    expect(runner.recordsFor(command.context)).toMatchObject([
      {
        id: request.command.id,
        status: 'failed',
        output: [
          {
            stream: 'system',
            text: 'Approval declined. Command was not run.\n',
          },
        ],
      },
    ]);
  });
});
