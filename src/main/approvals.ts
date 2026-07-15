import { randomUUID } from 'node:crypto';
import type { ApprovalRequest } from '../shared/contracts';
import type { CommandSpec } from './commands';
import type { CommandRunner } from './commands';

interface PendingApproval {
  spec: CommandSpec;
  recordId: string;
  expiresAt: number;
  afterSuccess?: () => Promise<void>;
}

export class ApprovalManager {
  readonly #pending = new Map<string, PendingApproval>();

  constructor(private readonly runner: CommandRunner) {}

  prepare(
    spec: CommandSpec,
    warning: string,
    afterSuccess?: () => Promise<void>,
  ): ApprovalRequest {
    const approvalId = randomUUID();
    const approvedSpec = { ...spec, requiresApproval: true };
    const command = this.runner.createPending(approvedSpec);
    this.#pending.set(approvalId, {
      spec: approvedSpec,
      recordId: command.id,
      expiresAt: Date.now() + 5 * 60_000,
      ...(afterSuccess ? { afterSuccess } : {}),
    });
    return { approvalId, command, warning };
  }

  async approve(approvalId: string): Promise<void> {
    const pending = this.#take(approvalId);
    const result = await this.runner.run(pending.spec, pending.recordId);
    if (result.record.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'The approved command failed.');
    }
    await pending.afterSuccess?.();
  }

  reject(approvalId: string): void {
    const pending = this.#take(approvalId);
    this.runner.reject(pending.recordId);
  }

  #take(approvalId: string): PendingApproval {
    const pending = this.#pending.get(approvalId);
    this.#pending.delete(approvalId);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error('This approval request expired. Please start the action again.');
    }
    return pending;
  }
}
