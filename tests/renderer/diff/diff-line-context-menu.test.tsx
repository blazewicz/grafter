// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DiffLineContextMenu,
  type DiffLineContextMenuState,
} from '../../../src/renderer/diff/DiffLineContextMenu';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';

const scenario = buildDiffViewerScenario();
const additionLineNumber = scenario.lines.addition.newLine;
const contextLineNumber = scenario.lines.context.newLine;
const deletionLineNumber = scenario.lines.deletion.oldLine;
if (
  additionLineNumber === undefined ||
  contextLineNumber === undefined ||
  deletionLineNumber === undefined
) {
  throw new Error('The diff viewer scenario must expose representative line numbers.');
}
const selectedText = `${scenario.lines.context.text}\n${scenario.lines.addition.text}`;
const availableRangeState = {
  x: 24,
  y: 32,
  copyText: selectedText,
  fileId: scenario.files.renamed.id,
  lineId: `${scenario.files.renamed.id}:new:${contextLineNumber}`,
  range: {
    startLine: contextLineNumber,
    endLine: additionLineNumber,
  },
  target: {
    path: scenario.expected.additionLine.path,
    line: contextLineNumber,
    revision: scenario.expected.additionLine.revision,
    side: 'new',
  },
  githubUrl: scenario.expected.newSideSelection.githubUrl,
  editorAvailable: true,
} satisfies DiffLineContextMenuState;
const unavailableState = {
  x: 24,
  y: 32,
  copyText: scenario.lines.deletion.text,
  fileId: scenario.files.renamed.id,
  lineId: `${scenario.files.renamed.id}:old:${deletionLineNumber}`,
  range: { startLine: deletionLineNumber },
  target: {
    path: scenario.expected.deletionLine.path,
    line: deletionLineNumber,
    revision: scenario.expected.deletionLine.revision,
    side: 'old',
  },
  editorAvailable: false,
} satisfies DiffLineContextMenuState;
const singleLineState = {
  ...availableRangeState,
  copyText: scenario.lines.addition.text,
  lineId: `${scenario.files.renamed.id}:new:${additionLineNumber}`,
  range: { startLine: additionLineNumber },
  target: {
    ...availableRangeState.target,
    line: additionLineNumber,
  },
  githubUrl: scenario.expected.additionLine.githubUrl,
} satisfies DiffLineContextMenuState;

interface MenuCallbacks {
  onClose: () => void;
  onCopy: (text: string) => void;
  onOpenEditor: () => void;
  onOpenGitHub: () => void;
}

function renderDiffLineContextMenu(
  state: DiffLineContextMenuState = availableRangeState,
  callbacks: MenuCallbacks = {
    onClose: () => undefined,
    onCopy: () => undefined,
    onOpenEditor: () => undefined,
    onOpenGitHub: () => undefined,
  },
): void {
  render(<DiffLineContextMenu state={state} {...callbacks} />);
}

function createCallbacks() {
  return {
    onClose: vi.fn<() => void>(),
    onCopy: vi.fn<(text: string) => void>(),
    onOpenEditor: vi.fn<() => void>(),
    onOpenGitHub: vi.fn<() => void>(),
  };
}

describe('DiffLineContextMenu', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('exposes all line actions and a separator when editor and GitHub are available', () => {
    renderDiffLineContextMenu();
    const menu = screen.getByRole('menu', { name: 'Diff line actions' });
    const expectedLabels = [
      'Copy',
      'Copy Relative Path',
      'Copy Line Reference',
      'Open in VS Code at Line',
      'Open on GitHub',
      'Copy GitHub Permalink',
    ];

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(expectedLabels.length);
    for (const label of expectedLabels) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeVisible();
    }
    expect(within(menu).getByRole('separator')).toBeVisible();
  });

  it('exposes only clipboard actions when editor and GitHub are unavailable', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    renderDiffLineContextMenu(unavailableState, callbacks);
    const menu = screen.getByRole('menu', { name: 'Diff line actions' });
    const expectedLabels = ['Copy', 'Copy Relative Path', 'Copy Line Reference'];

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(expectedLabels.length);
    for (const label of expectedLabels) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeVisible();
    }
    expect(within(menu).queryByRole('separator')).toBeNull();

    await user.click(within(menu).getByRole('menuitem', { name: 'Copy' }));

    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(callbacks.onCopy).toHaveBeenCalledOnce();
    expect(callbacks.onCopy).toHaveBeenCalledWith(unavailableState.copyText);
    expect(callbacks.onOpenEditor).not.toHaveBeenCalled();
    expect(callbacks.onOpenGitHub).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'Copy',
      callback: 'copy',
    },
    {
      label: 'Copy Relative Path',
      callback: 'copyPath',
    },
    {
      label: 'Copy Line Reference',
      callback: 'copyReference',
    },
    {
      label: 'Open in VS Code at Line',
      callback: 'openEditor',
    },
    {
      label: 'Open on GitHub',
      callback: 'openGitHub',
    },
    {
      label: 'Copy GitHub Permalink',
      callback: 'copyPermalink',
    },
  ] as const)('closes and runs the $label action once', async ({ label, callback }) => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    renderDiffLineContextMenu(availableRangeState, callbacks);

    await user.click(screen.getByRole('menuitem', { name: label }));

    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(callbacks.onCopy).toHaveBeenCalledTimes(
      callback === 'copy' ||
        callback === 'copyPath' ||
        callback === 'copyReference' ||
        callback === 'copyPermalink'
        ? 1
        : 0,
    );
    expect(callbacks.onOpenEditor).toHaveBeenCalledTimes(
      callback === 'openEditor' ? 1 : 0,
    );
    expect(callbacks.onOpenGitHub).toHaveBeenCalledTimes(
      callback === 'openGitHub' ? 1 : 0,
    );
    if (callback === 'copy') {
      expect(callbacks.onCopy).toHaveBeenCalledWith(selectedText);
    } else if (callback === 'copyPath') {
      expect(callbacks.onCopy).toHaveBeenCalledWith(scenario.expected.additionLine.path);
    } else if (callback === 'copyReference') {
      expect(callbacks.onCopy).toHaveBeenCalledWith(
        scenario.expected.newSideSelection.reference,
      );
    } else if (callback === 'copyPermalink') {
      expect(callbacks.onCopy).toHaveBeenCalledWith(
        scenario.expected.newSideSelection.githubUrl,
      );
    } else if (callback === 'openEditor') {
      expect(callbacks.onOpenEditor).toHaveBeenCalledWith();
    } else {
      expect(callbacks.onOpenGitHub).toHaveBeenCalledWith();
    }
  });

  it('copies the independently expected reference for a single line', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    renderDiffLineContextMenu(singleLineState, callbacks);

    await user.click(screen.getByRole('menuitem', { name: 'Copy Line Reference' }));

    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(callbacks.onCopy).toHaveBeenCalledOnce();
    expect(callbacks.onCopy).toHaveBeenCalledWith(
      scenario.expected.additionLine.reference,
    );
  });
});
