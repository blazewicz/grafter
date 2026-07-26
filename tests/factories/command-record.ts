import { Factory } from 'fishery';
import type { CommandRecord } from '../../src/shared/contracts';
import { fakeSlug, testFaker } from './faker';

type CommandRecordParams = Partial<CommandRecord>;

export const commandRecordFactory = Factory.define<
  CommandRecord,
  Record<never, never>,
  CommandRecord,
  CommandRecordParams
>(({ params }) => {
  const executable = params.executable ?? 'git';
  const args = params.args ?? ['status', '--short'];

  return {
    id: params.id ?? testFaker.string.uuid(),
    context: params.context ?? { kind: 'application' },
    tool: params.tool ?? 'git',
    executable,
    args,
    cwd: params.cwd ?? `/Users/developer/Code/${fakeSlug('repository')}`,
    displayCommand: params.displayCommand ?? [executable, ...args].join(' '),
    purpose: params.purpose ?? testFaker.lorem.sentence(),
    isReadOnly: params.isReadOnly ?? true,
    status: params.status ?? 'succeeded',
    requiresApproval: params.requiresApproval ?? false,
    startedAt:
      params.startedAt ??
      testFaker.date
        .recent({ days: 30, refDate: '2026-07-25T12:00:00.000Z' })
        .toISOString(),
    output: params.output ?? [],
  };
});
