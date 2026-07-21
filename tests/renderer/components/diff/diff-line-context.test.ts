import { describe, expect, it } from 'vitest';
import type { DiffFileSummary } from '../../../../src/shared/contracts';
import {
  diffLineCopyText,
  diffLineReference,
  diffLineTarget,
} from '../../../../src/renderer/components/diff/diff-line-context';

const session = { baseSha: 'base-sha', headSha: 'head-sha' };
const renamedFile: DiffFileSummary = {
  id: 'file',
  path: 'src/new name.ts',
  previousPath: 'src/old name.ts',
  status: 'renamed',
  binary: false,
};

describe('diff line context targets', () => {
  it('uses the head revision and current path for new-side lines', () => {
    const target = diffLineTarget(session, renamedFile, {
      kind: 'addition',
      text: 'new line',
      newLine: 12,
    });

    expect(target).toEqual({
      path: 'src/new name.ts',
      line: 12,
      revision: 'head-sha',
    });
    expect(target && diffLineReference(target)).toBe('src/new name.ts:12');
  });

  it('uses the base revision and previous path for deleted lines', () => {
    expect(
      diffLineTarget(session, renamedFile, {
        kind: 'deletion',
        text: 'old line',
        oldLine: 8,
      }),
    ).toEqual({
      path: 'src/old name.ts',
      line: 8,
      revision: 'base-sha',
    });
  });

  it('does not create line targets for annotations', () => {
    expect(
      diffLineTarget(session, renamedFile, {
        kind: 'annotation',
        text: 'No newline at end of file',
      }),
    ).toBeUndefined();
  });

  it('copies a file-local selection when present and otherwise the raw line', () => {
    expect(diffLineCopyText('whole line')).toBe('whole line');
    expect(diffLineCopyText('whole line', 'selected text')).toBe('selected text');
    expect(diffLineCopyText('', '')).toBe(' ');
  });
});
