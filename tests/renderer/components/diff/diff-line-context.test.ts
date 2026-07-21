import { describe, expect, it } from 'vitest';
import type { DiffFileSummary } from '../../../../src/shared/contracts';
import {
  diffLineCopyText,
  diffLineRange,
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
      side: 'new',
    });
    expect(target && diffLineReference(target)).toBe('src/new name.ts:12');
    expect(target && diffLineReference(target, { startLine: 10, endLine: 12 })).toBe(
      'src/new name.ts:10-12',
    );
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
      side: 'old',
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

  it('builds a range on the side of the line that opened the menu', () => {
    const selectedLines = [
      { kind: 'context' as const, text: 'before', oldLine: 19, newLine: 20 },
      { kind: 'deletion' as const, text: 'old', oldLine: 20 },
      { kind: 'addition' as const, text: 'new', newLine: 21 },
      { kind: 'context' as const, text: 'after', oldLine: 21, newLine: 22 },
    ];

    expect(
      diffLineRange(
        { path: renamedFile.path, line: 21, revision: 'head-sha', side: 'new' },
        selectedLines,
      ),
    ).toEqual({ startLine: 20, endLine: 22 });
    expect(
      diffLineRange(
        {
          path: renamedFile.previousPath ?? renamedFile.path,
          line: 20,
          revision: 'base-sha',
          side: 'old',
        },
        selectedLines,
      ),
    ).toEqual({ startLine: 19, endLine: 21 });
  });

  it('ignores a selection that does not include the clicked line', () => {
    expect(
      diffLineRange(
        { path: renamedFile.path, line: 40, revision: 'head-sha', side: 'new' },
        [{ kind: 'addition', text: 'elsewhere', newLine: 12 }],
      ),
    ).toEqual({ startLine: 40 });
  });
});
