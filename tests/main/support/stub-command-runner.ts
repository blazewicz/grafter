import type { CommandResult, CommandSpec } from '../../../src/main/commands';
import { CommandRunner } from '../../../src/main/commands';

interface StubbedResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

type StubHandler = (
  spec: CommandSpec,
  callIndex: number,
) => StubbedResult | Promise<StubbedResult>;

export class StubCommandRunner extends CommandRunner {
  readonly commands: CommandSpec[] = [];
  readonly #handler: StubHandler;

  constructor(handler: StubHandler) {
    super(() => undefined);
    this.#handler = handler;
  }

  override async run(spec: CommandSpec, existingId?: string): Promise<CommandResult> {
    void existingId;
    this.commands.push(structuredClone(spec));
    const result = await this.#handler(spec, this.commands.length - 1);
    const exitCode = result.exitCode ?? 0;
    const timestamp = new Date().toISOString();
    return {
      record: {
        id: `stub-${this.commands.length}`,
        context: structuredClone(spec.context),
        tool: spec.tool,
        executable: spec.executable,
        args: [...spec.args],
        cwd: spec.cwd,
        displayCommand: [spec.executable, ...spec.args].join(' '),
        purpose: spec.purpose,
        isReadOnly: spec.isReadOnly,
        status: exitCode === 0 ? 'succeeded' : 'failed',
        requiresApproval: spec.requiresApproval ?? false,
        startedAt: timestamp,
        finishedAt: timestamp,
        exitCode,
        output: [],
      },
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }
}
