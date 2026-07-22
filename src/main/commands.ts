import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
import { commandContextKey } from '../shared/command-context';
import type { CommandContext, CommandRecord, ToolName } from '../shared/contracts';

export interface CommandSpec {
  context: CommandContext;
  tool: ToolName;
  execution: {
    admission: 'limited' | 'direct';
    timeoutMs?: number;
  };
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
  terminationGraceMs?: number;
  rawOutputCharacterLimit?: number;
  liveUpdateIntervalMs?: number;
  onUpdateError?: (error: unknown) => void;
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
  // Parsers receive complete output up to this combined stdout/stderr ceiling.
  // Crossing it fails and terminates the command instead of silently truncating.
  static readonly rawOutputCharacterLimit = 16_000_000;
  static readonly liveUpdateIntervalMs = 75;
  static readonly terminationGraceMs = 1_000;
  static readonly maximumConcurrentCommands = 8;

  readonly #records = new Map<string, CommandRecord>();
  readonly #recordIdsByContext = new Map<string, string[]>();
  readonly #onUpdate: (record: CommandRecord) => void;
  readonly #now: () => number;
  readonly #terminationGraceMs: number;
  readonly #rawOutputCharacterLimit: number;
  readonly #liveUpdateIntervalMs: number;
  readonly #onUpdateError: (error: unknown) => void;
  readonly #pendingUpdates = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #commandsLimit = pLimit(CommandRunner.maximumConcurrentCommands);

  constructor(
    onUpdate: (record: CommandRecord) => void,
    options: CommandRunnerOptions = {},
  ) {
    this.#onUpdate = onUpdate;
    this.#now = options.now ?? (() => performance.now());
    this.#terminationGraceMs =
      options.terminationGraceMs ?? CommandRunner.terminationGraceMs;
    this.#rawOutputCharacterLimit =
      options.rawOutputCharacterLimit ?? CommandRunner.rawOutputCharacterLimit;
    this.#liveUpdateIntervalMs =
      options.liveUpdateIntervalMs ?? CommandRunner.liveUpdateIntervalMs;
    this.#onUpdateError =
      options.onUpdateError ??
      ((error) => console.error('Failed to publish command update.', error));
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
    return spec.execution.admission === 'direct'
      ? execute()
      : this.#commandsLimit(execute);
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
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let rawOutputCharacters = 0;
      let auditedOutputCharacters = 0;
      let auditOutputTruncated = false;
      let finalized = false;
      let terminationReason: 'timeout' | 'output-limit' | undefined;
      let outputLimitExceeded = false;
      let terminationTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutMs = spec.execution.timeoutMs;

      const cleanupTimers = (): void => {
        clearTimeout(timeoutTimer);
        if (terminationTimer) clearTimeout(terminationTimer);
      };

      const appendAuditedOutput = (stream: 'stdout' | 'stderr', text: string): void => {
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
            this.#save(record, true);
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
        this.#save(record, true);
      };

      const appendSystemMessage = (message: string): void => {
        const timestamp = new Date().toISOString();
        stderrChunks.push(`${message}\n`);
        record.output.push({
          stream: 'system',
          text: `${message}\n`,
          timestamp,
        });
        this.#save(record);
      };

      const beginTermination = (
        reason: 'timeout' | 'output-limit',
        message: string,
      ): void => {
        if (finalized || terminationReason) return;
        terminationReason = reason;
        appendSystemMessage(`${message} Sent SIGTERM.`);
        child.kill('SIGTERM');
        terminationTimer = setTimeout(() => {
          if (finalized) return;
          appendSystemMessage(
            'Command did not terminate during the grace period. Sent SIGKILL.',
          );
          child.kill('SIGKILL');
        }, this.#terminationGraceMs);
      };

      const failForOutputLimit = (): void => {
        if (outputLimitExceeded) return;
        outputLimitExceeded = true;
        const message = `Command output exceeded the ${this.#rawOutputCharacterLimit.toLocaleString('en-US')}-character capture limit.`;
        if (terminationReason) appendSystemMessage(message);
        else beginTermination('output-limit', message);
      };

      const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        if (finalized || outputLimitExceeded) return;
        const text = chunk.toString();
        const remaining = this.#rawOutputCharacterLimit - rawOutputCharacters;
        const capturedText = text.slice(0, Math.max(0, remaining));
        if (capturedText) {
          rawOutputCharacters += capturedText.length;
          if (stream === 'stdout') stdoutChunks.push(capturedText);
          else stderrChunks.push(capturedText);
          appendAuditedOutput(stream, capturedText);
        }
        if (capturedText.length < text.length) failForOutputLimit();
      };

      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
      const timeoutTimer = timeoutMs
        ? setTimeout(() => {
            if (finalized) return;
            const message = `Command timed out after ${timeoutMs.toLocaleString('en-US')} ms.`;
            beginTermination('timeout', message);
          }, timeoutMs)
        : undefined;

      child.on('error', (error) => {
        if (finalized) return;
        finalized = true;
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
        if (finalized) return;
        finalized = true;
        cleanupTimers();
        record.exitCode = code ?? 1;
        record.status =
          !terminationReason && !outputLimitExceeded && code === 0
            ? 'succeeded'
            : 'failed';
        record.finishedAt = new Date().toISOString();
        record.durationMs = Math.max(0, this.#now() - executionStartedAt);
        this.#save(record);
        resolve({
          record: structuredClone(record),
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
        });
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

  #save(record: CommandRecord, coalesce = false): void {
    const contextKey = commandContextKey(record.context);
    const contextIds = this.#recordIdsByContext.get(contextKey) ?? [];
    if (!this.#records.has(record.id)) {
      contextIds.push(record.id);
      this.#recordIdsByContext.set(contextKey, contextIds);
    }
    this.#records.set(record.id, record);
    this.#trimCompletedRecords(contextIds);
    if (coalesce) this.#scheduleUpdate(record);
    else this.#publishUpdate(record);
  }

  #scheduleUpdate(record: CommandRecord): void {
    if (this.#pendingUpdates.has(record.id)) return;
    const timer = setTimeout(() => {
      this.#pendingUpdates.delete(record.id);
      this.#notifyUpdate(record);
    }, this.#liveUpdateIntervalMs);
    this.#pendingUpdates.set(record.id, timer);
  }

  #publishUpdate(record: CommandRecord): void {
    const pending = this.#pendingUpdates.get(record.id);
    if (pending) {
      clearTimeout(pending);
      this.#pendingUpdates.delete(record.id);
    }
    this.#notifyUpdate(record);
  }

  #notifyUpdate(record: CommandRecord): void {
    try {
      this.#onUpdate(structuredClone(record));
    } catch (error) {
      this.#onUpdateError(error);
    }
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
