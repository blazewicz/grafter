import { describe, expect, it } from 'vitest';
import { CommandRunner, displayCommand, quoteArg } from '../src/main/commands';

describe('command display', () => {
  it('leaves safe arguments readable', () => {
    expect(displayCommand('git', ['worktree', 'list', '--porcelain'])).toBe(
      'git worktree list --porcelain',
    );
  });

  it('quotes spaces and embedded single quotes exactly', () => {
    expect(quoteArg("don't run this")).toBe("'don'\\''t run this'");
  });

  it('copies the explicit read-only classification into audit records', () => {
    const runner = new CommandRunner(() => undefined);
    const record = runner.createPending({
      tool: 'git',
      executable: 'git',
      args: ['status'],
      cwd: '/repo',
      purpose: 'Check repository status',
      isReadOnly: true,
    });

    expect(record.isReadOnly).toBe(true);
  });
});
