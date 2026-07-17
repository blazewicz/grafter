import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { commandContextKey } from '../shared/command-context';
import type { CommandContext, CommandRecord, ToolName } from '../shared/contracts';

export interface CommandSpec {
  context: CommandContext;
  tool: ToolName;
  executable: string;
  args: string[];
  cwd: string;
  purpose: string;
  isReadOnly: boolean;
  requiresApproval?: boolean;
}

export interface CommandResult {
  record: CommandRecord;
  stdout: string;
  stderr: string;
}

const shellSafe = /^[a-zA-Z0-9_./:@%+=,-]+$/;

export function quoteArg(value: string): string {
  if (shellSafe.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function displayCommand(executable: string, args: string[]): string {
  return [executable, ...args].map(quoteArg).join(' ');
}

export class CommandRunner {
  static readonly recordsPerContext = 200;

  readonly #records = new Map<string, CommandRecord>();
  readonly #recordIdsByContext = new Map<string, string[]>();
  readonly #onUpdate: (record: CommandRecord) => void;

  constructor(onUpdate: (record: CommandRecord) => void) {
    this.#onUpdate = onUpdate;
  }

  recordsFor(context: CommandContext): CommandRecord[] {
    const ids = this.#recordIdsByContext.get(commandContextKey(context)) ?? [];
    return ids
      .slice()
      .map((id) => this.#records.get(id))
      .filter((record): record is CommandRecord => record !== undefined)
      .reverse()
      .map((record) => structuredClone(record));
  }

  createPending(spec: CommandSpec): CommandRecord {
    const record = this.#makeRecord(spec, 'awaiting-approval');
    this.#save(record);
    return structuredClone(record);
  }

  reject(id: string): void {
    const record = this.#records.get(id);
    if (record?.status !== 'awaiting-approval') return;
    record.status = 'failed';
    record.finishedAt = new Date().toISOString();
    record.output.push({
      stream: 'system',
      text: 'Approval declined. Command was not run.\n',
      timestamp: record.finishedAt,
    });
    this.#save(record);
  }

  async run(spec: CommandSpec, existingId?: string): Promise<CommandResult> {
    const record = existingId
      ? this.#records.get(existingId)
      : this.#makeRecord(spec, 'running');
    if (!record) throw new Error('The approved command no longer exists.');
    record.status = 'running';
    this.#save(record);

    return new Promise((resolve, reject) => {
      const child = spawn(spec.executable, spec.args, {
        cwd: spec.cwd,
        env: process.env,
        shell: false,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';

      const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        const text = chunk.toString();
        if (stream === 'stdout') stdout += text;
        else stderr += text;
        record.output.push({ stream, text, timestamp: new Date().toISOString() });
        this.#save(record);
      };

      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
      child.on('error', (error) => {
        record.status = 'failed';
        record.finishedAt = new Date().toISOString();
        record.output.push({
          stream: 'system',
          text: `${error.message}\n`,
          timestamp: record.finishedAt,
        });
        this.#save(record);
        reject(error);
      });
      child.on('close', (code) => {
        record.exitCode = code ?? 1;
        record.status = code === 0 ? 'succeeded' : 'failed';
        record.finishedAt = new Date().toISOString();
        this.#save(record);
        resolve({ record: structuredClone(record), stdout, stderr });
      });
    });
  }

  #makeRecord(spec: CommandSpec, status: CommandRecord['status']): CommandRecord {
    return {
      id: randomUUID(),
      context: structuredClone(spec.context),
      tool: spec.tool,
      executable: spec.executable,
      args: [...spec.args],
      cwd: spec.cwd,
      displayCommand: displayCommand(spec.executable, spec.args),
      purpose: spec.purpose,
      isReadOnly: spec.isReadOnly,
      status,
      requiresApproval: spec.requiresApproval ?? false,
      startedAt: new Date().toISOString(),
      output: [],
    };
  }

  #save(record: CommandRecord): void {
    const contextKey = commandContextKey(record.context);
    const contextIds = this.#recordIdsByContext.get(contextKey) ?? [];
    if (!this.#records.has(record.id)) {
      contextIds.push(record.id);
      this.#recordIdsByContext.set(contextKey, contextIds);
    }
    this.#records.set(record.id, record);
    this.#trimCompletedRecords(contextIds);
    this.#onUpdate(structuredClone(record));
  }

  #trimCompletedRecords(contextIds: string[]): void {
    while (contextIds.length > CommandRunner.recordsPerContext) {
      const removableIndex = contextIds.findIndex((id) => {
        const status = this.#records.get(id)?.status;
        return status !== 'running' && status !== 'awaiting-approval';
      });
      if (removableIndex === -1) return;
      const [removedId] = contextIds.splice(removableIndex, 1);
      if (removedId) this.#records.delete(removedId);
    }
  }
}
