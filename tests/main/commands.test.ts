import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CommandContext } from '../../src/shared/contracts';
import { CommandRunner, displayCommand, quoteArg } from '../../src/main/commands';

const projectContext: CommandContext = { kind: 'project', projectId: 'project' };
const worktreeContext: CommandContext = {
  kind: 'worktree',
  projectId: 'project',
  worktreeId: 'worktree',
};
const limitedExecution = { admission: 'limited' } as const;

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
      execution: limitedExecution,
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
      execution: limitedExecution,
      executable: 'git',
      args: ['worktree', 'list'],
      cwd: '/repo',
      purpose: 'List worktrees',
      isReadOnly: true,
    });
    const worktreeRecord = runner.createPending({
      context: worktreeContext,
      tool: 'git',
      execution: limitedExecution,
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
        execution: limitedExecution,
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
      execution: limitedExecution,
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

describe('command execution timing', () => {
  it('records monotonic execution duration for successful commands', async () => {
    const times = [100, 112.3456];
    const runner = new CommandRunner(() => undefined, {
      now: () => times.shift() ?? 112.3456,
    });

    const result = await runner.run({
      context: projectContext,
      tool: 'git',
      execution: limitedExecution,
      executable: process.execPath,
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
      purpose: 'Run successful command',
      isReadOnly: true,
    });

    expect(result.record.status).toBe('succeeded');
    expect(result.record.durationMs).toBeCloseTo(12.3456);
  });

  it('records monotonic execution duration for failed commands', async () => {
    const times = [25, 34.8765];
    const runner = new CommandRunner(() => undefined, {
      now: () => times.shift() ?? 34.8765,
    });

    const result = await runner.run({
      context: projectContext,
      tool: 'git',
      execution: limitedExecution,
      executable: process.execPath,
      args: ['-e', 'process.exit(2)'],
      cwd: process.cwd(),
      purpose: 'Run failed command',
      isReadOnly: true,
    });

    expect(result.record.status).toBe('failed');
    expect(result.record.durationMs).toBeCloseTo(9.8765);
  });
});

describe('automated command admission', () => {
  it('never spawns more than the aggregate process ceiling', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-admission-'));
    const gatePath = path.join(directory, 'release');
    const startedIds = new Set<string>();
    let resolveCeilingReached: (() => void) | undefined;
    const ceilingReached = new Promise<void>((resolve) => {
      resolveCeilingReached = resolve;
    });
    const runner = new CommandRunner((record) => {
      if (record.output.some((entry) => entry.text.includes('started'))) {
        startedIds.add(record.id);
        if (startedIds.size === CommandRunner.maximumConcurrentCommands) {
          resolveCeilingReached?.();
        }
      }
    });
    const script =
      "const fs=require('node:fs'); process.stdout.write('started\\n'); " +
      'const timer=setInterval(()=>{if(fs.existsSync(process.argv[1])){' +
      'clearInterval(timer);process.exit(0)}},5)';

    const commands = Array.from(
      { length: CommandRunner.maximumConcurrentCommands + 4 },
      (_, index) =>
        runner.run({
          context: projectContext,
          tool: 'git',
          execution: limitedExecution,
          executable: process.execPath,
          args: ['-e', script, gatePath],
          cwd: directory,
          purpose: `Blocked automated command ${index}`,
          isReadOnly: true,
        }),
    );

    await ceilingReached;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(startedIds.size).toBe(CommandRunner.maximumConcurrentCommands);

    await writeFile(gatePath, 'release\n');
    await expect(Promise.all(commands)).resolves.toHaveLength(commands.length);
    expect(startedIds.size).toBe(commands.length);
  });

  it('kills and audits an automated command that times out', async () => {
    const updates: string[] = [];
    const runner = new CommandRunner(
      (record) => updates.push(...record.output.map((entry) => entry.text)),
      { terminationGraceMs: 20 },
    );

    const result = await runner.run({
      context: projectContext,
      tool: 'git',
      execution: { admission: 'limited', timeoutMs: 300 },
      executable: process.execPath,
      args: ['-e', "process.on('SIGTERM',()=>{}); setInterval(()=>undefined,1000)"],
      cwd: process.cwd(),
      purpose: 'Run a command that does not terminate',
      isReadOnly: true,
    });

    expect(result.record.status).toBe('failed');
    expect(result.record.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Command timed out after 300 ms.');
    expect(updates.some((text) => text.includes('Sent SIGTERM'))).toBe(true);
    expect(updates.some((text) => text.includes('Sent SIGKILL'))).toBe(true);
  });

  it('continues admitting commands after a limited task rejects', async () => {
    const runner = new CommandRunner(() => undefined);
    const missingCommand = runner.run({
      context: projectContext,
      tool: 'git',
      execution: limitedExecution,
      executable: 'grafter-command-that-does-not-exist',
      args: [],
      cwd: process.cwd(),
      purpose: 'Fail to spawn a command',
      isReadOnly: true,
    });

    await expect(missingCommand).rejects.toThrow();
    await expect(
      runner.run({
        context: projectContext,
        tool: 'git',
        execution: limitedExecution,
        executable: process.execPath,
        args: ['-e', 'process.exit(0)'],
        cwd: process.cwd(),
        purpose: 'Run after a rejected command',
        isReadOnly: true,
      }),
    ).resolves.toMatchObject({ record: { status: 'succeeded' } });
  });
});

describe('command output auditing', () => {
  it('coalesces chatty live updates and flushes the complete terminal record', async () => {
    const updates: ReturnType<CommandRunner['recordsFor']> = [];
    const writes = 40;
    const expectedOutput = Array.from(
      { length: writes },
      (_, index) => `${index}\n`,
    ).join('');
    const runner = new CommandRunner((record) => updates.push(record), {
      liveUpdateIntervalMs: 30,
    });
    const script =
      `let index=0; const timer=setInterval(()=>{` +
      `process.stdout.write(String(index)+'\\n'); index+=1;` +
      `if(index===${writes}) clearInterval(timer)},2)`;

    const result = await runner.run({
      context: projectContext,
      tool: 'git',
      execution: limitedExecution,
      executable: process.execPath,
      args: ['-e', script],
      cwd: process.cwd(),
      purpose: 'Produce chatty output',
      isReadOnly: true,
    });

    expect(result.stdout).toBe(expectedOutput);
    expect(result.record.status).toBe('succeeded');
    const auditedChunks = result.record.output.filter(
      (entry) => entry.stream === 'stdout',
    );
    expect(auditedChunks.length).toBeGreaterThan(20);
    expect(updates.length).toBeLessThan(auditedChunks.length / 2);
    expect(auditedChunks.map((entry) => entry.text).join('')).toBe(expectedOutput);
    const terminalIndex = updates.findIndex((record) => record.status === 'succeeded');
    expect(terminalIndex).toBeGreaterThanOrEqual(0);

    const updateCountAtCompletion = updates.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(updates).toHaveLength(updateCountAtCompletion);
    expect(updates.slice(terminalIndex + 1)).not.toContainEqual(
      expect.objectContaining({ status: 'running' }),
    );
  });

  it('returns complete stdout while bounding the stored audit output', async () => {
    const outputLength = CommandRunner.maximumAuditedOutputCharacters + 2000;
    const runner = new CommandRunner(() => undefined);
    const result = await runner.run({
      context: projectContext,
      tool: 'git',
      execution: limitedExecution,
      executable: process.execPath,
      args: ['-e', `process.stdout.write('x'.repeat(${outputLength}))`],
      cwd: process.cwd(),
      purpose: 'Read a large diff',
      isReadOnly: true,
    });

    expect(result.stdout).toHaveLength(outputLength);
    expect(
      result.record.output.filter(
        (entry) =>
          entry.stream === 'system' &&
          entry.text.includes('Command output truncated after'),
      ),
    ).toHaveLength(1);
    expect(
      result.record.output
        .filter((entry) => entry.stream === 'stdout')
        .reduce((total, entry) => total + entry.text.length, 0),
    ).toBe(CommandRunner.maximumAuditedOutputCharacters);
  });

  it('keeps raw output complete through the limit and fails clearly beyond it', async () => {
    const maxRawCharacters = 64;
    const updates: ReturnType<CommandRunner['recordsFor']> = [];
    const runner = new CommandRunner((record) => updates.push(record), {
      maximumRawOutputCharacters: maxRawCharacters,
      liveUpdateIntervalMs: 20,
      terminationGraceMs: 20,
    });
    const spec = (length: number) => ({
      context: projectContext,
      tool: 'git' as const,
      execution: limitedExecution,
      executable: process.execPath,
      args: ['-e', `process.stdout.write('x'.repeat(${length}))`],
      cwd: process.cwd(),
      purpose: `Capture ${length} characters`,
      isReadOnly: true,
    });

    const withinLimit = await runner.run(spec(maxRawCharacters));
    expect(withinLimit.record.status).toBe('succeeded');
    expect(withinLimit.stdout).toBe('x'.repeat(maxRawCharacters));

    const exceeded = await runner.run(spec(maxRawCharacters + 1));
    expect(exceeded.record.status).toBe('failed');
    expect(exceeded.stdout).toHaveLength(maxRawCharacters);
    expect(exceeded.stderr).toContain(
      `Command output exceeded the ${maxRawCharacters}-character capture limit.`,
    );
    expect(
      exceeded.record.output.some(
        (entry) => entry.stream === 'system' && entry.text.includes('capture limit'),
      ),
    ).toBe(true);

    const updateCountAtCompletion = updates.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates).toHaveLength(updateCountAtCompletion);
    expect(updates.at(-1)?.status).toBe('failed');
  });

  it('finalizes spawn-error and timeout paths once even when close follows', async () => {
    const updates: ReturnType<CommandRunner['recordsFor']> = [];
    const runner = new CommandRunner((record) => updates.push(record), {
      liveUpdateIntervalMs: 10,
      terminationGraceMs: 10,
    });

    await expect(
      runner.run({
        context: projectContext,
        tool: 'git',
        execution: limitedExecution,
        executable: 'grafter-command-that-does-not-exist-for-finalization',
        args: [],
        cwd: process.cwd(),
        purpose: 'Fail during spawn',
        isReadOnly: true,
      }),
    ).rejects.toThrow();
    expect(updates.filter((record) => record.status === 'failed')).toHaveLength(1);

    const timeoutResult = await runner.run({
      context: projectContext,
      tool: 'git',
      execution: { admission: 'limited', timeoutMs: 30 },
      executable: process.execPath,
      args: ['-e', 'setInterval(()=>undefined,1000)'],
      cwd: process.cwd(),
      purpose: 'Time out once',
      isReadOnly: true,
    });
    expect(timeoutResult.record.status).toBe('failed');
    expect(
      updates.filter(
        (record) => record.id === timeoutResult.record.id && record.status === 'failed',
      ),
    ).toHaveLength(1);
  });

  it('recovers from a failed live-update callback without stale timers', async () => {
    const updates: ReturnType<CommandRunner['recordsFor']> = [];
    const updateErrors: unknown[] = [];
    let rejectNextLiveUpdate = true;
    const runner = new CommandRunner(
      (record) => {
        if (
          rejectNextLiveUpdate &&
          record.status === 'running' &&
          record.output.length > 0
        ) {
          rejectNextLiveUpdate = false;
          throw new Error('Update callback failed');
        }
        updates.push(record);
      },
      {
        liveUpdateIntervalMs: 10,
        onUpdateError: (error) => updateErrors.push(error),
      },
    );

    const first = await runner.run({
      context: projectContext,
      tool: 'git',
      execution: limitedExecution,
      executable: process.execPath,
      args: ['-e', "process.stdout.write('started'); setTimeout(()=>{},30)"],
      cwd: process.cwd(),
      purpose: 'Fail one update callback',
      isReadOnly: true,
    });
    const second = await runner.run({
      context: projectContext,
      tool: 'git',
      execution: limitedExecution,
      executable: process.execPath,
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
      purpose: 'Run after callback failure',
      isReadOnly: true,
    });

    expect(updateErrors).toHaveLength(1);
    expect(updates.some((record) => record.id === first.record.id)).toBe(true);
    expect(updates.at(-1)).toMatchObject({
      id: second.record.id,
      status: 'succeeded',
    });
  });
});
