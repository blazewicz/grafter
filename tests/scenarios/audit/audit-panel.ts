import type { CommandRecord } from '../../../src/shared/contracts';
import { commandRecordFactory } from '../../factories';
import { timestampSequence } from '../../support/timestampSequence';

export interface AuditPanelScenario {
  commands: CommandRecord[];
  latestGit: CommandRecord;
  olderGit: CommandRecord;
  github: CommandRecord;
  shell: CommandRecord;
  repeatedReadOnly: {
    commands: CommandRecord[];
    latest: CommandRecord;
    older: CommandRecord;
  };
  expectedOutput: {
    latestGit: string;
    olderGit: string;
    github: string;
    shell: string;
    repeatedLatest: string;
    repeatedOlder: string;
  };
}

export function buildAuditPanelScenario(): AuditPanelScenario {
  const context = {
    kind: 'worktree',
    projectId: 'audit-project',
    worktreeId: 'audit-worktree',
  } as const;
  const expectedOutput = {
    latestGit: 'latest git output\n',
    olderGit: 'older git output\n',
    github: 'github output\n',
    shell: 'setup output\n',
    repeatedLatest: 'latest repeated output\n',
    repeatedOlder: 'older repeated output\n',
  };
  const start = new Date('2026-07-20T12:01:00.000');
  const nextTs = timestampSequence(start);
  const olderGit = commandRecordFactory.build({
    context,
    args: ['branch', '--show-current'],
    // startedAt: start.toISOString(),
    // startedAt: nextTs({milliseconds: 0}),
    startedAt: '2026-07-20T12:01:00.000',
    output: [
      {
        stream: 'stdout',
        text: expectedOutput.olderGit,
        timestamp: '2026-07-20T12:01:00.100',
      },
    ],
  });
  const shell = commandRecordFactory.build({
    context,
    tool: 'shell',
    executable: 'bash',
    args: ['setup.sh'],
    isReadOnly: false,
    startedAt: '2026-07-20T12:02:00.000',
    output: [
      {
        stream: 'stdout',
        text: expectedOutput.shell,
        timestamp: '2026-07-20T12:02:00.100',
      },
    ],
  });
  const github = commandRecordFactory.build({
    context,
    tool: 'github',
    executable: 'gh',
    args: ['pr', 'view'],
    startedAt: '2026-07-20T12:03:00.000',
    output: [
      {
        stream: 'stdout',
        text: expectedOutput.github,
        timestamp: '2026-07-20T12:03:00.100',
      },
    ],
  });
  const latestGit = commandRecordFactory.build({
    context,
    args: ['status', '--short'],
    startedAt: '2026-07-20T12:04:00.000',
    durationMs: 12.34,
    output: [
      {
        stream: 'stdout',
        text: expectedOutput.latestGit,
        timestamp: '2026-07-20T12:04:00.100',
      },
    ],
  });

  const repeatedOlder = commandRecordFactory.build({
    context,
    args: ['rev-parse', '--show-toplevel'],
    startedAt: '2026-07-20T12:05:00.000',
    output: [
      {
        stream: 'stdout',
        text: expectedOutput.repeatedOlder,
        timestamp: '2026-07-20T12:05:00.100',
      },
    ],
  });
  const repeatedLatest = commandRecordFactory.build({
    context,
    executable: repeatedOlder.executable,
    args: repeatedOlder.args,
    cwd: repeatedOlder.cwd,
    displayCommand: repeatedOlder.displayCommand,
    startedAt: '2026-07-20T12:06:00.000',
    output: [
      {
        stream: 'stdout',
        text: expectedOutput.repeatedLatest,
        timestamp: '2026-07-20T12:06:00.100',
      },
    ],
  });

  return {
    commands: [latestGit, github, shell, olderGit],
    latestGit,
    olderGit,
    github,
    shell,
    repeatedReadOnly: {
      commands: [repeatedLatest, repeatedOlder],
      latest: repeatedLatest,
      older: repeatedOlder,
    },
    expectedOutput,
  };
}
