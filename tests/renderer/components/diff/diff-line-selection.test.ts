// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDiffLineSelection,
  diffLineRowId,
  selectedDiffLines,
  selectionWithinFile,
  updateDiffLineSelection,
} from '../../../../src/renderer/components/diff/diff-line-selection';
import { buildDiffViewerScenario } from '../../../scenarios/diff/diff-viewer';

const scenario = buildDiffViewerScenario();

interface RenderedDiffFile {
  file: HTMLElement;
  rows: HTMLElement[];
}

function renderDiffFile(fileId: string, lines: readonly string[]): RenderedDiffFile {
  const file = document.createElement('section');
  file.dataset.diffFileId = fileId;
  const rows = lines.map((text, index) => {
    const row = document.createElement('div');
    row.dataset.diffLineId = diffLineRowId(fileId, 0, index);
    const code = document.createElement('code');
    code.textContent = text;
    row.append(code);
    file.append(row);
    return row;
  });
  document.body.append(file);
  return { file, rows };
}

function selectRows(startRow: HTMLElement, endRow: HTMLElement = startRow): string {
  const startNode = startRow.querySelector('code')?.firstChild;
  const endNode = endRow.querySelector('code')?.firstChild;
  const selection = window.getSelection();
  if (!startNode || !endNode || !selection) {
    throw new Error('Expected selectable diff line nodes.');
  }
  const range = document.createRange();
  range.setStart(startNode, 0);
  range.setEnd(endNode, endNode.textContent?.length ?? 0);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection.toString();
}

function collapseAt(row: HTMLElement): void {
  const node = row.querySelector('code')?.firstChild;
  const selection = window.getSelection();
  if (!node || !selection) throw new Error('Expected a selectable diff line node.');
  const range = document.createRange();
  range.setStart(node, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('diff line selection', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it('maps an in-file DOM selection to its text and diff lines', () => {
    const patch = scenario.patches.textual;
    const rendered = renderDiffFile(
      patch.fileId,
      patch.hunks[0]?.lines.map((line) => line.text) ?? [],
    );
    const firstRow = rendered.rows[0];
    const secondRow = rendered.rows[1];
    if (!firstRow || !secondRow) throw new Error('Expected representative rows.');
    const selectedText = selectRows(firstRow, secondRow);

    const selection = selectionWithinFile(secondRow);

    expect(selection?.text).toBe(selectedText);
    expect(selection?.rowIds).toEqual(
      new Set([diffLineRowId(patch.fileId, 0, 0), diffLineRowId(patch.fileId, 0, 1)]),
    );
    expect(selectedDiffLines(patch, selection?.rowIds ?? new Set())).toEqual(
      patch.hunks[0]?.lines.slice(0, 2),
    );
  });

  it('moves row highlighting and clears it for a collapsed selection', () => {
    const pane = document.createElement('div');
    document.body.append(pane);
    const rendered = renderDiffFile('first-file', ['context', 'deletion', 'addition']);
    pane.append(rendered.file);
    const [context, deletion, addition] = rendered.rows;
    if (!context || !deletion || !addition) throw new Error('Expected three rows.');

    selectRows(context, deletion);
    updateDiffLineSelection(pane);
    expect(context).toHaveAttribute('data-selected', 'true');
    expect(deletion).toHaveAttribute('data-selected', 'true');
    expect(addition).not.toHaveAttribute('data-selected');

    selectRows(addition);
    updateDiffLineSelection(pane);
    expect(context).not.toHaveAttribute('data-selected');
    expect(deletion).not.toHaveAttribute('data-selected');
    expect(addition).toHaveAttribute('data-selected', 'true');

    collapseAt(addition);
    updateDiffLineSelection(pane);
    expect(addition).not.toHaveAttribute('data-selected');
  });

  it('does not highlight or expose a selection crossing file boundaries', () => {
    const pane = document.createElement('div');
    document.body.append(pane);
    const first = renderDiffFile('first-file', ['first context', 'first deletion']);
    const second = renderDiffFile('second-file', ['second context', 'second addition']);
    pane.append(first.file, second.file);
    const firstRow = first.rows[0];
    const secondRow = second.rows[1];
    if (!firstRow || !secondRow) throw new Error('Expected cross-file rows.');

    selectRows(firstRow, secondRow);
    updateDiffLineSelection(pane);

    for (const row of [...first.rows, ...second.rows]) {
      expect(row).not.toHaveAttribute('data-selected');
    }
    expect(selectionWithinFile(secondRow)).toBeUndefined();
  });

  it('clears existing row state within the requested pane', () => {
    const pane = document.createElement('div');
    document.body.append(pane);
    const rendered = renderDiffFile('first-file', ['context', 'addition']);
    pane.append(rendered.file);
    for (const row of rendered.rows) row.dataset.selected = 'true';

    clearDiffLineSelection(pane);

    for (const row of rendered.rows) expect(row).not.toHaveAttribute('data-selected');
  });
});
