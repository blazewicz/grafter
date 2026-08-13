// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
import type {
  DiffFileSummary,
  DiffLine,
  DiffSession,
} from '../../../src/shared/contracts';
import {
  getDiffLineRow,
  getFileSection,
  installDiffViewerObservers,
  type DiffViewerCallbacks,
  type IntersectionObserverHarness,
  renderDiffViewer,
  scenario,
  selectDiffLineText,
} from './diff-viewer-test-harness';

let intersectionObservers: IntersectionObserverHarness;

const fileDerivationCases = [
  {
    name: 'added file',
    file: scenario.files.added,
    expected: scenario.expected.addedFile,
  },
  {
    name: 'renamed file',
    file: scenario.files.renamed,
    expected: scenario.expected.renamedFile,
  },
  {
    name: 'deleted file',
    file: scenario.files.deleted,
    expected: scenario.expected.deletedFile,
  },
] as const satisfies readonly {
  name: string;
  file: DiffFileSummary;
  expected: { path: string; githubUrl: string };
}[];

const lineDerivationCases = [
  {
    name: 'context line',
    line: scenario.lines.context,
    expected: scenario.expected.contextLine,
  },
  {
    name: 'addition line',
    line: scenario.lines.addition,
    expected: scenario.expected.additionLine,
  },
  {
    name: 'deletion line',
    line: scenario.lines.deletion,
    expected: scenario.expected.deletionLine,
  },
] as const satisfies readonly {
  name: string;
  line: DiffLine;
  expected: { path: string; reference: string; githubUrl: string };
}[];

interface MenuRejectionCase {
  label: string;
  apiMethod: 'copyText' | 'openDiffFileInEditor' | 'openExternal';
  message: string;
  expectedArgs: readonly unknown[];
}

const fileRejectionCases = [
  {
    label: 'Copy Relative Path',
    apiMethod: 'copyText',
    message: 'file copy failed',
    expectedArgs: [scenario.expected.addedFile.path],
  },
  {
    label: 'Open in VS Code',
    apiMethod: 'openDiffFileInEditor',
    message: 'file editor failed',
    expectedArgs: [
      {
        sessionId: scenario.branchSession.id,
        fileId: scenario.files.added.id,
        editor: 'vscode',
      },
    ],
  },
  {
    label: 'Open on GitHub',
    apiMethod: 'openExternal',
    message: 'file external failed',
    expectedArgs: [scenario.expected.addedFile.githubUrl],
  },
] as const satisfies readonly MenuRejectionCase[];

const lineRejectionCases = [
  {
    label: 'Copy',
    apiMethod: 'copyText',
    message: 'line copy failed',
    expectedArgs: [scenario.lines.addition.text],
  },
  {
    label: 'Open in VS Code at Line',
    apiMethod: 'openDiffFileInEditor',
    message: 'line editor failed',
    expectedArgs: [
      {
        sessionId: scenario.branchSession.id,
        fileId: scenario.files.renamed.id,
        editor: 'vscode',
        line: scenario.lines.addition.newLine,
      },
    ],
  },
  {
    label: 'Open on GitHub',
    apiMethod: 'openExternal',
    message: 'line external failed',
    expectedArgs: [scenario.expected.additionLine.githubUrl],
  },
] as const satisfies readonly MenuRejectionCase[];

function callbacks(onError: (message: string) => void = () => undefined) {
  return {
    onSessionChange: () => undefined,
    onClose: () => undefined,
    onError,
  } satisfies DiffViewerCallbacks;
}

function treeFile(file: DiffFileSummary): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Changed file tree' })).getByTitle(
    file.path,
  );
}

function menuItem(menu: HTMLElement, name: string): HTMLElement {
  return within(menu).getByRole('menuitem', { name });
}

async function clickFileAction(anchor: HTMLElement, label: string): Promise<void> {
  fireEvent.contextMenu(anchor);
  await userEvent
    .setup()
    .click(menuItem(screen.getByRole('menu', { name: 'Diff file actions' }), label));
}

async function clickLineAction(anchor: HTMLElement, label: string): Promise<void> {
  fireEvent.contextMenu(anchor);
  await userEvent
    .setup()
    .click(menuItem(screen.getByRole('menu', { name: 'Diff line actions' }), label));
}

function sessionWithoutGitHub(session: DiffSession): DiffSession {
  const next = { ...session };
  delete next.githubRepository;
  return next;
}

function sessionWithFile(
  session: DiffSession,
  replacement: DiffFileSummary,
): DiffSession {
  return {
    ...session,
    files: session.files.map((file) => (file.id === replacement.id ? replacement : file)),
  };
}

async function renderLoadedTextualDiff(
  session: DiffSession = scenario.branchSession,
  viewerCallbacks: DiffViewerCallbacks = callbacks(),
  files: readonly DiffFileSummary[] = [scenario.files.renamed],
): Promise<void> {
  vi.spyOn(api, 'getDiffFile').mockImplementation(({ fileId }) => {
    const file = files.find((candidate) => candidate.id === fileId);
    if (!file) return Promise.reject(new Error(`Unexpected patch request for ${fileId}`));
    return Promise.resolve({ ...scenario.patches.textual, fileId });
  });
  renderDiffViewer(session, viewerCallbacks);

  act(() => {
    for (const file of files) {
      intersectionObservers.notify(getFileSection(file), true);
    }
  });

  for (const file of files) {
    await within(getFileSection(file)).findByText(scenario.lines.context.text, {
      selector: 'code',
    });
  }
}

function diffPaneFor(file: DiffFileSummary): HTMLElement {
  const pane = getFileSection(file).parentElement;
  if (!pane) throw new Error('Expected the rendered file to belong to the diff pane.');
  return pane;
}

function expectSelectionToIntersect(row: HTMLElement): void {
  const code = row.querySelector('code');
  const selection = window.getSelection();
  if (!code || !selection?.rangeCount) {
    throw new Error('Expected a selected diff line.');
  }
  expect(selection.getRangeAt(0).intersectsNode(code)).toBe(true);
}

describe('DiffViewer integrated file context menu', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    cleanup();
    intersectionObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(fileDerivationCases)(
    'copies the exact relative path for a $name',
    async ({ file, expected }) => {
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      renderDiffViewer();
      const anchor = treeFile(file);

      expect(anchor).toBeVisible();
      await clickFileAction(anchor, 'Copy Relative Path');

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected.path);
    },
  );

  it.each(fileDerivationCases)(
    'opens the exact GitHub URL for a $name',
    async ({ file, expected }) => {
      const openExternal = vi.spyOn(api, 'openExternal').mockResolvedValue(undefined);
      renderDiffViewer();
      const anchor = treeFile(file);

      expect(anchor).toBeVisible();
      await clickFileAction(anchor, 'Open on GitHub');

      expect(openExternal).toHaveBeenCalledOnce();
      expect(openExternal).toHaveBeenCalledWith(expected.githubUrl);
    },
  );

  it.each(fileDerivationCases)(
    'copies the exact GitHub permalink for a $name',
    async ({ file, expected }) => {
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      renderDiffViewer();
      const anchor = treeFile(file);

      expect(anchor).toBeVisible();
      await clickFileAction(anchor, 'Copy GitHub Permalink');

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected.githubUrl);
    },
  );

  it('opens a branch file in VS Code with the exact session and file IDs', async () => {
    const openDiffFileInEditor = vi
      .spyOn(api, 'openDiffFileInEditor')
      .mockResolvedValue(undefined);
    renderDiffViewer();
    const anchor = treeFile(scenario.files.renamed);

    expect(anchor).toBeVisible();
    await clickFileAction(anchor, 'Open in VS Code');

    expect(openDiffFileInEditor).toHaveBeenCalledOnce();
    expect(openDiffFileInEditor).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: scenario.files.renamed.id,
      editor: 'vscode',
    });
  });

  it('omits GitHub actions when the session has no GitHub repository', () => {
    const file = scenario.files.added;
    renderDiffViewer(sessionWithoutGitHub(scenario.branchSession));
    const anchor = treeFile(file);

    expect(anchor).toBeVisible();
    fireEvent.contextMenu(anchor);
    const menu = screen.getByRole('menu', { name: 'Diff file actions' });

    expect(menuItem(menu, 'Copy Relative Path')).toBeVisible();
    expect(within(menu).queryByRole('menuitem', { name: 'Open on GitHub' })).toBeNull();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Copy GitHub Permalink' }),
    ).toBeNull();
  });

  it.each([
    {
      name: 'detached branch',
      session: scenario.detachedBranchSession,
      file: scenario.files.modified,
    },
    {
      name: 'deleted branch file',
      session: scenario.branchSession,
      file: scenario.files.deleted,
    },
    {
      name: 'commit',
      session: scenario.commitSession,
      file: scenario.files.modified,
    },
  ])('omits the editor action for a $name session target', ({ session, file }) => {
    renderDiffViewer(session);
    const anchor = treeFile(file);

    expect(anchor).toBeVisible();
    fireEvent.contextMenu(anchor);
    const menu = screen.getByRole('menu', { name: 'Diff file actions' });

    expect(within(menu).queryByRole('menuitem', { name: 'Open in VS Code' })).toBeNull();
  });

  it.each(fileRejectionCases)(
    'reports a rejected $label file action',
    async ({ apiMethod, label, message, expectedArgs }) => {
      const rejectedCall = vi.spyOn(api, apiMethod).mockRejectedValue(new Error(message));
      const onError = vi.fn<(message: string) => void>();
      renderDiffViewer(scenario.branchSession, callbacks(onError));
      const anchor = treeFile(scenario.files.added);

      expect(anchor).toBeVisible();
      await clickFileAction(anchor, label);

      await waitFor(() => expect(onError).toHaveBeenCalledOnce());
      expect(onError).toHaveBeenCalledWith(message);
      expect(rejectedCall).toHaveBeenCalledOnce();
      expect(rejectedCall).toHaveBeenCalledWith(...expectedArgs);
    },
  );

  it('keeps one integrated menu open and closes menus on filtering or pane scrolling', async () => {
    const user = userEvent.setup();
    const file = scenario.files.renamed;
    await renderLoadedTextualDiff();
    const line = getDiffLineRow(file, scenario.lines.addition);
    const fileAnchor = treeFile(file);
    const tree = screen.getByRole('navigation', { name: 'Changed file tree' });
    const diffPane = diffPaneFor(file);

    expect(line).toBeVisible();
    fireEvent.contextMenu(line);
    expect(screen.getByRole('menu', { name: 'Diff line actions' })).toBeVisible();

    expect(fileAnchor).toBeVisible();
    fireEvent.contextMenu(fileAnchor);
    expect(screen.getByRole('menu', { name: 'Diff file actions' })).toBeVisible();
    expect(screen.queryByRole('menu', { name: 'Diff line actions' })).toBeNull();

    fireEvent.contextMenu(line);
    expect(screen.getByRole('menu', { name: 'Diff line actions' })).toBeVisible();
    expect(screen.queryByRole('menu', { name: 'Diff file actions' })).toBeNull();
    fireEvent.scroll(diffPane);
    expect(screen.queryByRole('menu', { name: 'Diff line actions' })).toBeNull();

    fireEvent.contextMenu(fileAnchor);
    expect(screen.getByRole('menu', { name: 'Diff file actions' })).toBeVisible();
    fireEvent.scroll(tree);
    expect(screen.queryByRole('menu', { name: 'Diff file actions' })).toBeNull();

    fireEvent.contextMenu(fileAnchor);
    expect(screen.getByRole('menu', { name: 'Diff file actions' })).toBeVisible();
    await user.type(
      screen.getByRole('textbox', { name: 'Filter changed files' }),
      'diff-contracts',
    );
    expect(screen.queryByRole('menu', { name: 'Diff file actions' })).toBeNull();
  });
});

describe('DiffViewer integrated line context menu', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    cleanup();
    intersectionObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(lineDerivationCases)(
    'copies the exact relative path for a $name',
    async ({ line, expected }) => {
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      await renderLoadedTextualDiff();
      const anchor = getDiffLineRow(scenario.files.renamed, line);

      expect(anchor).toBeVisible();
      await clickLineAction(anchor, 'Copy Relative Path');

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected.path);
    },
  );

  it.each(lineDerivationCases)(
    'copies the exact line reference for a $name',
    async ({ line, expected }) => {
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      await renderLoadedTextualDiff();
      const anchor = getDiffLineRow(scenario.files.renamed, line);

      expect(anchor).toBeVisible();
      await clickLineAction(anchor, 'Copy Line Reference');

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected.reference);
    },
  );

  it.each(lineDerivationCases)(
    'opens the exact GitHub URL for a $name',
    async ({ line, expected }) => {
      const openExternal = vi.spyOn(api, 'openExternal').mockResolvedValue(undefined);
      await renderLoadedTextualDiff();
      const anchor = getDiffLineRow(scenario.files.renamed, line);

      expect(anchor).toBeVisible();
      await clickLineAction(anchor, 'Open on GitHub');

      expect(openExternal).toHaveBeenCalledOnce();
      expect(openExternal).toHaveBeenCalledWith(expected.githubUrl);
    },
  );

  it.each(lineDerivationCases)(
    'copies the exact GitHub permalink for a $name',
    async ({ line, expected }) => {
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      await renderLoadedTextualDiff();
      const anchor = getDiffLineRow(scenario.files.renamed, line);

      expect(anchor).toBeVisible();
      await clickLineAction(anchor, 'Copy GitHub Permalink');

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected.githubUrl);
    },
  );

  it('does not open a line menu for an annotation without a target', async () => {
    const file = scenario.files.renamed;
    await renderLoadedTextualDiff();
    const annotation = getDiffLineRow(file, scenario.lines.annotation);

    expect(annotation).toBeVisible();
    fireEvent.contextMenu(annotation);

    expect(screen.queryByRole('menu', { name: 'Diff line actions' })).toBeNull();
  });

  it('copies the clicked line text', async () => {
    const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
    await renderLoadedTextualDiff();
    const anchor = getDiffLineRow(scenario.files.renamed, scenario.lines.addition);

    expect(anchor).toBeVisible();
    await clickLineAction(anchor, 'Copy');

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.lines.addition.text);
  });

  it('opens the clicked line at its exact target line in VS Code', async () => {
    const openDiffFileInEditor = vi
      .spyOn(api, 'openDiffFileInEditor')
      .mockResolvedValue(undefined);
    await renderLoadedTextualDiff();
    const anchor = getDiffLineRow(scenario.files.renamed, scenario.lines.addition);

    expect(anchor).toBeVisible();
    await clickLineAction(anchor, 'Open in VS Code at Line');

    expect(openDiffFileInEditor).toHaveBeenCalledOnce();
    expect(openDiffFileInEditor).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: scenario.files.renamed.id,
      editor: 'vscode',
      line: scenario.lines.addition.newLine,
    });
  });

  it.each([
    {
      name: 'detached branch',
      session: scenario.detachedBranchSession,
      file: scenario.files.renamed,
    },
    {
      name: 'deleted file',
      session: sessionWithFile(scenario.branchSession, {
        ...scenario.files.renamed,
        status: 'deleted',
      }),
      file: { ...scenario.files.renamed, status: 'deleted' as const },
    },
    {
      name: 'commit',
      session: scenario.commitSession,
      file: scenario.files.renamed,
    },
  ])('omits the editor action for a $name line target', async ({ session, file }) => {
    await renderLoadedTextualDiff(session, callbacks(), [file]);
    const anchor = getDiffLineRow(file, scenario.lines.addition);

    expect(anchor).toBeVisible();
    fireEvent.contextMenu(anchor);
    const menu = screen.getByRole('menu', { name: 'Diff line actions' });

    expect(
      within(menu).queryByRole('menuitem', { name: 'Open in VS Code at Line' }),
    ).toBeNull();
  });

  it('omits GitHub line actions when the session has no GitHub repository', async () => {
    const file = scenario.files.renamed;
    await renderLoadedTextualDiff(sessionWithoutGitHub(scenario.branchSession));
    const anchor = getDiffLineRow(file, scenario.lines.addition);

    expect(anchor).toBeVisible();
    fireEvent.contextMenu(anchor);
    const menu = screen.getByRole('menu', { name: 'Diff line actions' });

    expect(menuItem(menu, 'Copy Line Reference')).toBeVisible();
    expect(within(menu).queryByRole('menuitem', { name: 'Open on GitHub' })).toBeNull();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Copy GitHub Permalink' }),
    ).toBeNull();
  });

  it.each(lineRejectionCases)(
    'reports a rejected $label line action',
    async ({ apiMethod, label, message, expectedArgs }) => {
      const rejectedCall = vi.spyOn(api, apiMethod).mockRejectedValue(new Error(message));
      const onError = vi.fn<(message: string) => void>();
      await renderLoadedTextualDiff(scenario.branchSession, callbacks(onError));
      const anchor = getDiffLineRow(scenario.files.renamed, scenario.lines.addition);

      expect(anchor).toBeVisible();
      await clickLineAction(anchor, label);

      await waitFor(() => expect(onError).toHaveBeenCalledOnce());
      expect(onError).toHaveBeenCalledWith(message);
      expect(rejectedCall).toHaveBeenCalledOnce();
      expect(rejectedCall).toHaveBeenCalledWith(...expectedArgs);
    },
  );
});

describe('DiffViewer selected line ranges', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    cleanup();
    intersectionObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('copies the selected text from a new-side in-file selection', async () => {
    const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
    await renderLoadedTextualDiff();
    const context = getDiffLineRow(scenario.files.renamed, scenario.lines.context);
    const deletion = getDiffLineRow(scenario.files.renamed, scenario.lines.deletion);
    const addition = getDiffLineRow(scenario.files.renamed, scenario.lines.addition);
    const selectedText = selectDiffLineText(context, addition);

    expectSelectionToIntersect(context);
    expectSelectionToIntersect(deletion);
    expectSelectionToIntersect(addition);
    expect(addition).toBeVisible();
    await clickLineAction(addition, 'Copy');

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(selectedText);
  });

  it.each([
    {
      label: 'Copy Line Reference',
      expected: scenario.expected.newSideSelection.reference,
    },
    {
      label: 'Copy GitHub Permalink',
      expected: scenario.expected.newSideSelection.githubUrl,
    },
  ] as const)(
    'copies the $label from a new-side in-file selection',
    async ({ label, expected }) => {
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      await renderLoadedTextualDiff();
      const context = getDiffLineRow(scenario.files.renamed, scenario.lines.context);
      const deletion = getDiffLineRow(scenario.files.renamed, scenario.lines.deletion);
      const addition = getDiffLineRow(scenario.files.renamed, scenario.lines.addition);

      selectDiffLineText(context, addition);
      expectSelectionToIntersect(context);
      expectSelectionToIntersect(deletion);
      expectSelectionToIntersect(addition);
      expect(addition).toBeVisible();
      await clickLineAction(addition, label);

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected);
    },
  );

  it.each([
    {
      label: 'Copy Line Reference',
      expected: scenario.expected.oldSideSelection.reference,
    },
    {
      label: 'Copy GitHub Permalink',
      expected: scenario.expected.oldSideSelection.githubUrl,
    },
  ] as const)(
    'uses only old-side line numbers for the $label when a mixed selection opens on a deletion',
    async ({ label, expected }) => {
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      await renderLoadedTextualDiff();
      const context = getDiffLineRow(scenario.files.renamed, scenario.lines.context);
      const deletion = getDiffLineRow(scenario.files.renamed, scenario.lines.deletion);
      const addition = getDiffLineRow(scenario.files.renamed, scenario.lines.addition);

      selectDiffLineText(context, addition);
      expect(deletion).toBeVisible();
      await clickLineAction(deletion, label);

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected);
    },
  );

  it.each([
    { label: 'Copy', expected: scenario.lines.addition.text },
    {
      label: 'Copy Line Reference',
      expected: scenario.expected.additionLine.reference,
    },
  ] as const)(
    'falls back to the clicked line for the $label when the selection does not include it',
    async ({ label, expected }) => {
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      await renderLoadedTextualDiff();
      const context = getDiffLineRow(scenario.files.renamed, scenario.lines.context);
      const addition = getDiffLineRow(scenario.files.renamed, scenario.lines.addition);

      selectDiffLineText(context);
      expect(addition).toBeVisible();
      await clickLineAction(addition, label);

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected);
    },
  );

  it.each([
    { label: 'Copy', expected: scenario.lines.addition.text },
    {
      label: 'Copy Line Reference',
      expected: scenario.expected.additionLine.reference,
    },
  ] as const)(
    'ignores a selection that crosses diff file boundaries for the $label',
    async ({ label, expected }) => {
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      const firstFile = scenario.files.modified;
      const clickedFile = scenario.files.renamed;
      await renderLoadedTextualDiff(scenario.branchSession, callbacks(), [
        firstFile,
        clickedFile,
      ]);
      const firstRow = getDiffLineRow(firstFile, scenario.lines.context);
      const clickedRow = getDiffLineRow(clickedFile, scenario.lines.addition);

      selectDiffLineText(firstRow, clickedRow);
      expect(clickedRow).toBeVisible();
      await clickLineAction(clickedRow, label);

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected);
    },
  );
});
