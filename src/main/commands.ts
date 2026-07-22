import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
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

interface CommandRunnerOptions {
  now?: () => number;
  gitTimeoutMs?: number;
  githubTimeoutMs?: number;
  terminationGraceMs?: number;
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
  static readonly auditedOutputCharacterLimit = 128_000;
  static readonly gitTimeoutMs = 60_000;
  static readonly githubTimeoutMs = 30_000;
  static readonly terminationGraceMs = 1_000;
  static readonly maximumConcurrentAutomatedCommands = 8;

  readonly #records = new Map<string, CommandRecord>();
  readonly #recordIdsByContext = new Map<string, string[]>();
  readonly #onUpdate: (record: CommandRecord) => void;
  readonly #now: () => number;
  readonly #gitTimeoutMs: number;
  readonly #githubTimeoutMs: number;
  readonly #terminationGraceMs: number;
  readonly #automatedCommandsLimit = pLimit(
    CommandRunner.maximumConcurrentAutomatedCommands,
  );

  constructor(
    onUpdate: (record: CommandRecord) => void,
    options: CommandRunnerOptions = {},
  ) {
    this.#onUpdate = onUpdate;
    this.#now = options.now ?? (() => performance.now());
    this.#gitTimeoutMs = options.gitTimeoutMs ?? CommandRunner.gitTimeoutMs;
    this.#githubTimeoutMs = options.githubTimeoutMs ?? CommandRunner.githubTimeoutMs;
    this.#terminationGraceMs =
      options.terminationGraceMs ?? CommandRunner.terminationGraceMs;
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

    const execute = (): Promise<CommandResult> => this.#execute(spec, record);
    return spec.tool === 'shell' ? execute() : this.#automatedCommandsLimit(execute);
  }

  #execute(spec: CommandSpec, record: CommandRecord): Promise<CommandResult> {
    const executionStartedAt = this.#now();

    return new Promise((resolve, reject) => {
      const child = spawn(spec.executable, spec.args, {
        cwd: spec.cwd,
        env: process.env,
        shell: false,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let auditedOutputCharacters = 0;
      let auditOutputTruncated = false;
      let settled = false;
      let timedOut = false;
      let terminationTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutMs =
        spec.tool === 'git'
          ? this.#gitTimeoutMs
          : spec.tool === 'github'
            ? this.#githubTimeoutMs
            : undefined;

      const cleanupTimers = (): void => {
        clearTimeout(timeoutTimer);
        if (terminationTimer) clearTimeout(terminationTimer);
      };

      const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        const text = chunk.toString();
        if (stream === 'stdout') stdout += text;
        else stderr += text;

        const remaining =
          CommandRunner.auditedOutputCharacterLimit - auditedOutputCharacters;
        if (remaining <= 0) {
          if (!auditOutputTruncated) {
            auditOutputTruncated = true;
            record.output.push({
              stream: 'system',
              text: `Command output truncated after ${CommandRunner.auditedOutputCharacterLimit.toLocaleString('en-US')} characters.\n`,
              timestamp: new Date().toISOString(),
            });
            this.#save(record);
          }
          return;
        }
        const auditedText = text.slice(0, remaining);
        auditedOutputCharacters += auditedText.length;
        const timestamp = new Date().toISOString();
        if (auditedText) record.output.push({ stream, text: auditedText, timestamp });
        if (auditedText.length < text.length && !auditOutputTruncated) {
          auditOutputTruncated = true;
          record.output.push({
            stream: 'system',
            text: `Command output truncated after ${CommandRunner.auditedOutputCharacterLimit.toLocaleString('en-US')} characters.\n`,
            timestamp,
          });
        }
        this.#save(record);
      };

      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
      const timeoutTimer = timeoutMs
        ? setTimeout(() => {
            if (settled) return;
            timedOut = true;
            const timestamp = new Date().toISOString();
            const message = `Command timed out after ${timeoutMs.toLocaleString('en-US')} ms.`;
            stderr += `${message}\n`;
            record.output.push({
              stream: 'system',
              text: `${message} Sent SIGTERM.\n`,
              timestamp,
            });
            this.#save(record);
            child.kill('SIGTERM');
            terminationTimer = setTimeout(() => {
              if (settled) return;
              record.output.push({
                stream: 'system',
                text: 'Command did not terminate during the grace period. Sent SIGKILL.\n',
                timestamp: new Date().toISOString(),
              });
              this.#save(record);
              child.kill('SIGKILL');
            }, this.#terminationGraceMs);
          }, timeoutMs)
        : undefined;

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        cleanupTimers();
        record.status = 'failed';
        record.finishedAt = new Date().toISOString();
        record.durationMs = Math.max(0, this.#now() - executionStartedAt);
        record.output.push({
          stream: 'system',
          text: `${error.message}\n`,
          timestamp: record.finishedAt,
        });
        this.#save(record);
        reject(error);
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        cleanupTimers();
        record.exitCode = code ?? 1;
        record.status = !timedOut && code === 0 ? 'succeeded' : 'failed';
        record.finishedAt = new Date().toISOString();
        record.durationMs = Math.max(0, this.#now() - executionStartedAt);
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
