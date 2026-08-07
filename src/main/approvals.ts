import { randomUUID } from 'node:crypto';
import type { ApprovalRequest } from '../shared/contracts';
import type { CommandSpec } from './commands';
import type { CommandRunner } from './commands';

interface PendingApproval {
  spec: CommandSpec;
  recordId: string;
  expiresAt: number;
  expirationTimer: ReturnType<typeof setTimeout>;
  afterSuccess?: () => Promise<void>;
  execution?: ApprovalExecution;
}

type ApprovalExecution = (executePreparedCommand: () => Promise<void>) => Promise<void>;
const approvalLifetimeMs = 5 * 60_000;

export class ApprovalManager {
  readonly #pending = new Map<string, PendingApproval>();
  #disposed = false;

  constructor(private readonly runner: CommandRunner) {}

  prepare(
    spec: CommandSpec,
    warning: string,
    afterSuccess?: () => Promise<void>,
    execution?: ApprovalExecution,
  ): ApprovalRequest {
    this.#assertActive();
    const approvalId = randomUUID();
    const approvedSpec = { ...spec, requiresApproval: true };
    const command = this.runner.createPending(approvedSpec);
    const expirationTimer = setTimeout(
      () => this.#expire(approvalId),
      approvalLifetimeMs,
    );
    expirationTimer.unref();
    this.#pending.set(approvalId, {
      spec: approvedSpec,
      recordId: command.id,
      expiresAt: Date.now() + approvalLifetimeMs,
      expirationTimer,
      ...(afterSuccess ? { afterSuccess } : {}),
      ...(execution ? { execution } : {}),
    });
    return { approvalId, command, warning };
  }

  async approve(approvalId: string): Promise<void> {
    this.#assertActive();
    const pending = this.#take(approvalId);
    const executePreparedCommand = async (): Promise<void> => {
      const result = await this.runner.run(pending.spec, pending.recordId);
      if (result.record.exitCode !== 0) {
        throw new Error(result.stderr.trim() || 'The approved command failed.');
      }
      await pending.afterSuccess?.();
    };
    if (pending.execution) await pending.execution(executePreparedCommand);
    else await executePreparedCommand();
  }

  reject(approvalId: string): void {
    this.#assertActive();
    const pending = this.#take(approvalId);
    this.runner.reject(pending.recordId);
  }

  #take(approvalId: string): PendingApproval {
    const pending = this.#pending.get(approvalId);
    this.#pending.delete(approvalId);
    if (!pending) {
      throw new Error('This approval request expired. Please start the action again.');
    }
    clearTimeout(pending.expirationTimer);
    if (pending.expiresAt < Date.now()) {
      this.runner.expire(pending.recordId);
      throw new Error('This approval request expired. Please start the action again.');
    }
    return pending;
  }

  #expire(approvalId: string): void {
    const pending = this.#pending.get(approvalId);
    if (!pending) return;
    this.#pending.delete(approvalId);
    this.runner.expire(pending.recordId);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.expirationTimer);
      this.runner.expire(pending.recordId);
    }
    this.#pending.clear();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('The repository service is disposed.');
  }
}
