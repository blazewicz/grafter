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

describe('DiffViewer selection cleanup', () => {
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
