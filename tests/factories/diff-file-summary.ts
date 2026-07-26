import { Factory } from 'fishery';
import type { DiffFileStatus, DiffFileSummary } from '../../src/shared/contracts';
import { fakeSlug, testFaker } from './faker';

const statusesWithPreviousPaths = new Set<DiffFileStatus>([
  'copied',
  'deleted',
  'renamed',
]);

export const diffFileSummaryFactory = Factory.define<DiffFileSummary>(({ params }) => {
  const status = params.status ?? 'modified';
  const binary = params.binary ?? false;
  const path = params.path ?? `src/${fakeSlug('file')}.ts`;
  const previousPath =
    params.previousPath ??
    (statusesWithPreviousPaths.has(status)
      ? `src/${fakeSlug('previous-file')}.ts`
      : undefined);
  const additions =
    params.additions ?? (binary ? undefined : testFaker.number.int({ min: 0, max: 80 }));
  const deletions =
    params.deletions ?? (binary ? undefined : testFaker.number.int({ min: 0, max: 40 }));

  return {
    id: params.id ?? testFaker.string.uuid(),
    path,
    ...(previousPath === undefined ? {} : { previousPath }),
    status,
    ...(additions === undefined ? {} : { additions }),
    ...(deletions === undefined ? {} : { deletions }),
    binary,
  };
});
