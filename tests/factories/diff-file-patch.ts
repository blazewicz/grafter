import { Factory } from 'fishery';
import type {
  DiffFilePatch,
  DiffFileSummary,
  DiffLine,
  DiffLineKind,
} from '../../src/shared/contracts';
import { testFaker } from './faker';

interface DiffFilePatchTransientParams {
  file?: DiffFileSummary;
  lineKinds?: readonly DiffLineKind[];
  oldStart?: number;
  newStart?: number;
}

const defaultLineKinds = ['context', 'deletion', 'addition'] as const;

export const diffFilePatchFactory = Factory.define<
  DiffFilePatch,
  DiffFilePatchTransientParams
>(({ afterBuild, params, transientParams }) => {
  const file = transientParams.file;
  const binary = params.binary ?? file?.binary ?? false;
  const oldStart = transientParams.oldStart ?? testFaker.number.int({ min: 1, max: 80 });
  const newStart = transientParams.newStart ?? testFaker.number.int({ min: 1, max: 80 });
  const lines = buildDiffLines(
    transientParams.lineKinds ?? defaultLineKinds,
    oldStart,
    newStart,
  );
  const oldLines = lines.filter((line) => line.oldLine !== undefined).length;
  const newLines = lines.filter((line) => line.newLine !== undefined).length;

  afterBuild((patch) => {
    if (file && patch.fileId !== file.id) {
      throw new Error('The diff patch must belong to its associated file.');
    }
  });

  return {
    fileId: params.fileId ?? file?.id ?? testFaker.string.uuid(),
    binary,
    hunks:
      params.hunks ??
      (binary
        ? []
        : [
            {
              header: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`,
              oldStart,
              oldLines,
              newStart,
              newLines,
              lines,
            },
          ]),
  };
});

function buildDiffLines(
  kinds: readonly DiffLineKind[],
  oldStart: number,
  newStart: number,
): DiffLine[] {
  let oldLine = oldStart;
  let newLine = newStart;

  return kinds.map((kind) => {
    if (kind === 'annotation') {
      return {
        kind,
        text: 'No newline at end of file',
      };
    }

    const line = {
      kind,
      text: testFaker.lorem.words({ min: 2, max: 6 }),
      ...(kind === 'addition' ? {} : { oldLine }),
      ...(kind === 'deletion' ? {} : { newLine }),
    };
    if (kind !== 'addition') oldLine += 1;
    if (kind !== 'deletion') newLine += 1;
    return line;
  });
}
