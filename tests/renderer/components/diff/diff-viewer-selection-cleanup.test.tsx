// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../../src/renderer/grafter-api';
import type { DiffFileSummary, DiffSession } from '../../../../src/shared/contracts';
import {
  getDiffLineRow,
  getFileSection,
  installDiffViewerObservers,
  type IntersectionObserverHarness,
  renderDiffViewer,
  type ResizeObserverHarness,
  ResizeObserverHarness as ControlledResizeObservers,
  scenario,
  selectDiffLineText,
} from './diff-viewer-test-harness';

let intersectionObservers: IntersectionObserverHarness;
let resizeObservers: ResizeObserverHarness;

function sessionWithFiles(files: DiffFileSummary[]): DiffSession {
  return {
    ...scenario.branchSession,
    files,
    stats: {
      files: files.length,
      additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
      deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
    },
  };
}

async function renderTextualFiles(
  files: DiffFileSummary[],
  session: DiffSession = sessionWithFiles(files),
): Promise<RenderResult> {
  vi.spyOn(api, 'getDiffFile').mockImplementation(({ fileId }) =>
    Promise.resolve({ ...scenario.patches.textual, fileId }),
  );
  const result = renderDiffViewer(session);

  act(() => {
    for (const file of files) {
      intersectionObservers.notify(getFileSection(file), true);
    }
  });
  for (const file of files) {
    await screen.findByText(scenario.lines.context.text, {
      selector: `#diff-viewer-${file.id} code`,
    });
  }
  return result;
}

function dispatchSelectionChange(): void {
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

function collapseSelectionAt(row: HTMLElement): void {
  const node = row.querySelector('code')?.firstChild;
  const selection = window.getSelection();
  if (!node || !selection) throw new Error('Expected a selectable diff line.');
  const range = document.createRange();
  range.setStart(node, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('DiffViewer selection highlighting', () => {
  beforeEach(() => {
    resizeObservers = new ControlledResizeObservers();
    intersectionObservers = installDiffViewerObservers(resizeObservers);
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    cleanup();
    intersectionObservers.reset();
    resizeObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('marks only rows intersecting a selection within one file', async () => {
    const file = scenario.files.renamed;
    await renderTextualFiles([file]);
    const context = getDiffLineRow(file, scenario.lines.context);
    const deletion = getDiffLineRow(file, scenario.lines.deletion);
    const addition = getDiffLineRow(file, scenario.lines.addition);
    const annotation = getDiffLineRow(file, scenario.lines.annotation);

    selectDiffLineText(context, deletion);
    dispatchSelectionChange();

    expect(context).toHaveAttribute('data-selected', 'true');
    expect(deletion).toHaveAttribute('data-selected', 'true');
    expect(addition).not.toHaveAttribute('data-selected');
    expect(annotation).not.toHaveAttribute('data-selected');
  });

  it('moves highlighting to the new selection and clears it when collapsed', async () => {
    const file = scenario.files.renamed;
    await renderTextualFiles([file]);
    const context = getDiffLineRow(file, scenario.lines.context);
    const deletion = getDiffLineRow(file, scenario.lines.deletion);
    const addition = getDiffLineRow(file, scenario.lines.addition);

    selectDiffLineText(context, deletion);
    dispatchSelectionChange();
    expect(context).toHaveAttribute('data-selected', 'true');
    expect(deletion).toHaveAttribute('data-selected', 'true');

    selectDiffLineText(addition);
    dispatchSelectionChange();
    expect(context).not.toHaveAttribute('data-selected');
    expect(deletion).not.toHaveAttribute('data-selected');
    expect(addition).toHaveAttribute('data-selected', 'true');

    collapseSelectionAt(addition);
    dispatchSelectionChange();
    expect(addition).not.toHaveAttribute('data-selected');
  });

  it('does not combine a selection crossing file boundaries into one highlight', async () => {
    const firstFile = scenario.files.modified;
    const secondFile = scenario.files.renamed;
    await renderTextualFiles([firstFile, secondFile]);
    const firstContext = getDiffLineRow(firstFile, scenario.lines.context);
    const firstDeletion = getDiffLineRow(firstFile, scenario.lines.deletion);
    const secondContext = getDiffLineRow(secondFile, scenario.lines.context);
    const secondAddition = getDiffLineRow(secondFile, scenario.lines.addition);

    selectDiffLineText(firstContext, secondAddition);
    dispatchSelectionChange();

    expect(firstContext).not.toHaveAttribute('data-selected');
    expect(firstDeletion).not.toHaveAttribute('data-selected');
    expect(secondContext).not.toHaveAttribute('data-selected');
    expect(secondAddition).not.toHaveAttribute('data-selected');
  });

  it('clears selected row state and removes the selection listener on unmount', async () => {
    const file = scenario.files.renamed;
    const { unmount } = await renderTextualFiles([file]);
    const row = getDiffLineRow(file, scenario.lines.addition);

    selectDiffLineText(row);
    dispatchSelectionChange();
    expect(row).toHaveAttribute('data-selected', 'true');

    unmount();
    expect(row).not.toHaveAttribute('data-selected');

    row.dataset.selected = 'true';
    dispatchSelectionChange();
    expect(row).toHaveAttribute('data-selected', 'true');
  });
});

describe('DiffViewer scheduled-work cleanup', () => {
  beforeEach(() => {
    resizeObservers = new ControlledResizeObservers();
    intersectionObservers = installDiffViewerObservers(resizeObservers);
  });

  afterEach(() => {
    cleanup();
    intersectionObservers.reset();
    resizeObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('cancels both pending copy-feedback timers on unmount', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
    const file = scenario.files.renamed;
    const session = {
      ...scenario.commitSession,
      files: [file],
      stats: {
        files: 1,
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
      },
    };
    const { unmount } = renderDiffViewer(session);

    fireEvent.click(screen.getByRole('button', { name: `Copy ${file.path} path` }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy full commit hash' }));
    await act(async () => Promise.resolve());

    expect(screen.getByRole('button', { name: 'File path copied' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Commit hash copied' })).toBeVisible();
    expect(vi.getTimerCount()).toBe(2);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
