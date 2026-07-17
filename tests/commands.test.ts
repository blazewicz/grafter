import { describe, expect, it } from 'vitest';
import type { CommandContext } from '../src/shared/contracts';
import { CommandRunner, displayCommand, quoteArg } from '../src/main/commands';

const projectContext: CommandContext = { kind: 'project', projectId: 'project' };
const worktreeContext: CommandContext = {
  kind: 'worktree',
  projectId: 'project',
  worktreeId: 'worktree',
};

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
      context: worktreeContext,
      tool: 'git',
      executable: 'git',
      args: ['status'],
      cwd: '/repo',
      purpose: 'Check repository status',
      isReadOnly: true,
    });

    expect(record.isReadOnly).toBe(true);
    expect(record.context).toEqual(worktreeContext);
  });
});

describe('command log contexts', () => {
  it('keeps project and worktree records isolated', () => {
    const runner = new CommandRunner(() => undefined);
    const projectRecord = runner.createPending({
      context: projectContext,
      tool: 'git',
      executable: 'git',
      args: ['worktree', 'list'],
      cwd: '/repo',
      purpose: 'List worktrees',
      isReadOnly: true,
    });
    const worktreeRecord = runner.createPending({
      context: worktreeContext,
      tool: 'git',
      executable: 'git',
      args: ['status'],
      cwd: '/repo',
      purpose: 'Check status',
      isReadOnly: true,
    });

    expect(runner.recordsFor(projectContext).map(({ id }) => id)).toEqual([
      projectRecord.id,
    ]);
    expect(runner.recordsFor(worktreeContext).map(({ id }) => id)).toEqual([
      worktreeRecord.id,
    ]);
  });

  it('retains the most recent completed records independently per context', () => {
    const runner = new CommandRunner(() => undefined);

    for (let index = 0; index <= CommandRunner.recordsPerContext; index += 1) {
      const record = runner.createPending({
        context: projectContext,
        tool: 'git',
        executable: 'git',
        args: ['status'],
        cwd: '/repo',
        purpose: `Project command ${index}`,
        isReadOnly: true,
      });
      runner.reject(record.id);
    }
    const worktreeRecord = runner.createPending({
      context: worktreeContext,
      tool: 'git',
      executable: 'git',
      args: ['status'],
      cwd: '/repo',
      purpose: 'Worktree command',
      isReadOnly: true,
    });

    const projectRecords = runner.recordsFor(projectContext);
    expect(projectRecords).toHaveLength(CommandRunner.recordsPerContext);
    expect(projectRecords[0]?.purpose).toBe(
      `Project command ${CommandRunner.recordsPerContext}`,
    );
    expect(projectRecords.at(-1)?.purpose).toBe('Project command 1');
    expect(runner.recordsFor(worktreeContext)).toEqual([worktreeRecord]);
  });
});
