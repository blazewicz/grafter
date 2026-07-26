import { Factory } from 'fishery';
import type { CommandRecord } from '../../src/shared/contracts';
import { fakeSlug, testFaker } from './faker';

type CommandRecordPreset = 'succeeded-read-only' | 'awaiting-approval';

interface CommandRecordTransientParams {
  preset: CommandRecordPreset;
}

type CommandRecordState = Pick<
  CommandRecord,
  'isReadOnly' | 'status' | 'requiresApproval'
>;

const commandRecordPresets = {
  'succeeded-read-only': {
    isReadOnly: true,
    status: 'succeeded',
    requiresApproval: false,
  },
  'awaiting-approval': {
    isReadOnly: false,
    status: 'awaiting-approval',
    requiresApproval: true,
  },
} satisfies Record<CommandRecordPreset, CommandRecordState>;

export const commandRecordFactory = Factory.define<
  CommandRecord,
  CommandRecordTransientParams
>(({ params, transientParams }) => {
  const executable = params.executable ?? 'git';
  const args = params.args ?? ['status', '--short'];
  const preset = transientParams.preset ?? 'succeeded-read-only';

  return {
    id: testFaker.string.uuid(),
    context: { kind: 'application' },
    tool: 'git',
    executable,
    args,
    cwd: `/Users/developer/Code/${fakeSlug('repository')}`,
    displayCommand: [executable, ...args].join(' '),
    purpose: testFaker.lorem.sentence(),
    ...commandRecordPresets[preset],
    startedAt: testFaker.date
      .recent({ days: 30, refDate: '2026-07-25T12:00:00.000Z' })
      .toISOString(),
    output: [],
  };
});
