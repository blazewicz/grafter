// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../../src/renderer/grafter-api';
import type { DiffFileSummary, DiffSession } from '../../../../src/shared/contracts';
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

  it.each([
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
  ])(
    'derives the exact path, revision, and GitHub URL for a $name',
    async ({ file, expected }) => {
      const user = userEvent.setup();
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      const openExternal = vi.spyOn(api, 'openExternal').mockResolvedValue(undefined);
      renderDiffViewer();
      const anchor = treeFile(file);

      expect(anchor).toBeVisible();
      fireEvent.contextMenu(anchor);
      let menu = screen.getByRole('menu', { name: 'Diff file actions' });
      let action = menuItem(menu, 'Copy Relative Path');
      expect(action).toBeVisible();
      await user.click(action);

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected.path);

      fireEvent.contextMenu(anchor);
      menu = screen.getByRole('menu', { name: 'Diff file actions' });
      action = menuItem(menu, 'Open on GitHub');
      expect(action).toBeVisible();
      await user.click(action);

      expect(openExternal).toHaveBeenCalledOnce();
      expect(openExternal).toHaveBeenCalledWith(expected.githubUrl);

      fireEvent.contextMenu(anchor);
      menu = screen.getByRole('menu', { name: 'Diff file actions' });
      action = menuItem(menu, 'Copy GitHub Permalink');
      expect(action).toBeVisible();
      await user.click(action);

      expect(copyText).toHaveBeenCalledTimes(2);
      expect(copyText).toHaveBeenNthCalledWith(2, expected.githubUrl);
    },
  );

  it('opens a branch file in VS Code with the exact session and file IDs', async () => {
    const user = userEvent.setup();
    const file = scenario.files.renamed;
    const openDiffFileInEditor = vi
      .spyOn(api, 'openDiffFileInEditor')
      .mockResolvedValue(undefined);
    renderDiffViewer();
    const anchor = treeFile(file);

    expect(anchor).toBeVisible();
    fireEvent.contextMenu(anchor);
    const menu = screen.getByRole('menu', { name: 'Diff file actions' });
    const action = menuItem(menu, 'Open in VS Code');
    expect(action).toBeVisible();
    await user.click(action);

    expect(openDiffFileInEditor).toHaveBeenCalledOnce();
    expect(openDiffFileInEditor).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
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

  it('reports rejected file copy, editor, and external actions', async () => {
    const user = userEvent.setup();
    const file = scenario.files.added;
    const copyText = vi
      .spyOn(api, 'copyText')
      .mockRejectedValue(new Error('file copy failed'));
    const openDiffFileInEditor = vi
      .spyOn(api, 'openDiffFileInEditor')
      .mockRejectedValue(new Error('file editor failed'));
    const openExternal = vi
      .spyOn(api, 'openExternal')
      .mockRejectedValue(new Error('file external failed'));
    const onError = vi.fn<(message: string) => void>();
    renderDiffViewer(scenario.branchSession, callbacks(onError));
    const anchor = treeFile(file);

    expect(anchor).toBeVisible();
    fireEvent.contextMenu(anchor);
    let menu = screen.getByRole('menu', { name: 'Diff file actions' });
    let action = menuItem(menu, 'Copy Relative Path');
    expect(action).toBeVisible();
    await user.click(action);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    fireEvent.contextMenu(anchor);
    menu = screen.getByRole('menu', { name: 'Diff file actions' });
    action = menuItem(menu, 'Open in VS Code');
    expect(action).toBeVisible();
    await user.click(action);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));

    fireEvent.contextMenu(anchor);
    menu = screen.getByRole('menu', { name: 'Diff file actions' });
    action = menuItem(menu, 'Open on GitHub');
    expect(action).toBeVisible();
    await user.click(action);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(3));

    expect(onError).toHaveBeenNthCalledWith(1, 'file copy failed');
    expect(onError).toHaveBeenNthCalledWith(2, 'file editor failed');
    expect(onError).toHaveBeenNthCalledWith(3, 'file external failed');
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.expected.addedFile.path);
    expect(openDiffFileInEditor).toHaveBeenCalledOnce();
    expect(openDiffFileInEditor).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
      editor: 'vscode',
    });
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(scenario.expected.addedFile.githubUrl);
  });

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

  it.each([
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
  ])(
    'derives the exact side-specific path, reference, revision, and URL for a $name',
    async ({ line, expected }) => {
      const user = userEvent.setup();
      const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
      const openExternal = vi.spyOn(api, 'openExternal').mockResolvedValue(undefined);
      const file = scenario.files.renamed;
      await renderLoadedTextualDiff();
      const anchor = getDiffLineRow(file, line);

      expect(anchor).toBeVisible();
      fireEvent.contextMenu(anchor);
      let menu = screen.getByRole('menu', { name: 'Diff line actions' });
      let action = menuItem(menu, 'Copy Relative Path');
      expect(action).toBeVisible();
      await user.click(action);

      expect(copyText).toHaveBeenCalledOnce();
      expect(copyText).toHaveBeenCalledWith(expected.path);

      fireEvent.contextMenu(anchor);
      menu = screen.getByRole('menu', { name: 'Diff line actions' });
      action = menuItem(menu, 'Copy Line Reference');
      expect(action).toBeVisible();
      await user.click(action);

      expect(copyText).toHaveBeenCalledTimes(2);
      expect(copyText).toHaveBeenNthCalledWith(2, expected.reference);

      fireEvent.contextMenu(anchor);
      menu = screen.getByRole('menu', { name: 'Diff line actions' });
      action = menuItem(menu, 'Open on GitHub');
      expect(action).toBeVisible();
      await user.click(action);

      expect(openExternal).toHaveBeenCalledOnce();
      expect(openExternal).toHaveBeenCalledWith(expected.githubUrl);

      fireEvent.contextMenu(anchor);
      menu = screen.getByRole('menu', { name: 'Diff line actions' });
      action = menuItem(menu, 'Copy GitHub Permalink');
      expect(action).toBeVisible();
      await user.click(action);

      expect(copyText).toHaveBeenCalledTimes(3);
      expect(copyText).toHaveBeenNthCalledWith(3, expected.githubUrl);
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

  it('copies the clicked line and opens its exact target line in VS Code', async () => {
    const user = userEvent.setup();
    const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
    const openDiffFileInEditor = vi
      .spyOn(api, 'openDiffFileInEditor')
      .mockResolvedValue(undefined);
    const file = scenario.files.renamed;
    const line = scenario.lines.addition;
    await renderLoadedTextualDiff();
    const anchor = getDiffLineRow(file, line);

    expect(anchor).toBeVisible();
    fireEvent.contextMenu(anchor);
    let menu = screen.getByRole('menu', { name: 'Diff line actions' });
    let action = menuItem(menu, 'Copy');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(line.text);

    fireEvent.contextMenu(anchor);
    menu = screen.getByRole('menu', { name: 'Diff line actions' });
    action = menuItem(menu, 'Open in VS Code at Line');
    expect(action).toBeVisible();
    await user.click(action);

    expect(openDiffFileInEditor).toHaveBeenCalledOnce();
    expect(openDiffFileInEditor).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
      editor: 'vscode',
      line: line.newLine,
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

  it('reports rejected line copy, editor, and external actions', async () => {
    const user = userEvent.setup();
    const copyText = vi
      .spyOn(api, 'copyText')
      .mockRejectedValue(new Error('line copy failed'));
    const openDiffFileInEditor = vi
      .spyOn(api, 'openDiffFileInEditor')
      .mockRejectedValue(new Error('line editor failed'));
    const openExternal = vi
      .spyOn(api, 'openExternal')
      .mockRejectedValue(new Error('line external failed'));
    const onError = vi.fn<(message: string) => void>();
    const file = scenario.files.renamed;
    const line = scenario.lines.addition;
    await renderLoadedTextualDiff(scenario.branchSession, callbacks(onError));
    const anchor = getDiffLineRow(file, line);

    expect(anchor).toBeVisible();
    fireEvent.contextMenu(anchor);
    let menu = screen.getByRole('menu', { name: 'Diff line actions' });
    let action = menuItem(menu, 'Copy');
    expect(action).toBeVisible();
    await user.click(action);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    fireEvent.contextMenu(anchor);
    menu = screen.getByRole('menu', { name: 'Diff line actions' });
    action = menuItem(menu, 'Open in VS Code at Line');
    expect(action).toBeVisible();
    await user.click(action);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));

    fireEvent.contextMenu(anchor);
    menu = screen.getByRole('menu', { name: 'Diff line actions' });
    action = menuItem(menu, 'Open on GitHub');
    expect(action).toBeVisible();
    await user.click(action);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(3));

    expect(onError).toHaveBeenNthCalledWith(1, 'line copy failed');
    expect(onError).toHaveBeenNthCalledWith(2, 'line editor failed');
    expect(onError).toHaveBeenNthCalledWith(3, 'line external failed');
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(line.text);
    expect(openDiffFileInEditor).toHaveBeenCalledOnce();
    expect(openDiffFileInEditor).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
      editor: 'vscode',
      line: line.newLine,
    });
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(scenario.expected.additionLine.githubUrl);
  });
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

  it('copies an in-file selection and uses only new-side line numbers for its range', async () => {
    const user = userEvent.setup();
    const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
    const file = scenario.files.renamed;
    await renderLoadedTextualDiff();
    const context = getDiffLineRow(file, scenario.lines.context);
    const addition = getDiffLineRow(file, scenario.lines.addition);
    const selectedText = selectDiffLineText(context, addition);

    expect(selectedText).toContain(scenario.lines.context.text);
    expect(selectedText).toContain(scenario.lines.deletion.text);
    expect(selectedText).toContain(scenario.lines.addition.text);
    expect(addition).toBeVisible();
    fireEvent.contextMenu(addition);
    let menu = screen.getByRole('menu', { name: 'Diff line actions' });
    let action = menuItem(menu, 'Copy');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(selectedText);

    selectDiffLineText(context, addition);
    fireEvent.contextMenu(addition);
    menu = screen.getByRole('menu', { name: 'Diff line actions' });
    action = menuItem(menu, 'Copy Line Reference');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledTimes(2);
    expect(copyText).toHaveBeenNthCalledWith(
      2,
      scenario.expected.newSideSelection.reference,
    );

    selectDiffLineText(context, addition);
    fireEvent.contextMenu(addition);
    menu = screen.getByRole('menu', { name: 'Diff line actions' });
    action = menuItem(menu, 'Copy GitHub Permalink');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledTimes(3);
    expect(copyText).toHaveBeenNthCalledWith(
      3,
      scenario.expected.newSideSelection.githubUrl,
    );
  });

  it('uses only old-side line numbers when a mixed selection opens on a deletion', async () => {
    const user = userEvent.setup();
    const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
    const file = scenario.files.renamed;
    await renderLoadedTextualDiff();
    const context = getDiffLineRow(file, scenario.lines.context);
    const deletion = getDiffLineRow(file, scenario.lines.deletion);
    const addition = getDiffLineRow(file, scenario.lines.addition);

    selectDiffLineText(context, addition);
    expect(deletion).toBeVisible();
    fireEvent.contextMenu(deletion);
    let menu = screen.getByRole('menu', { name: 'Diff line actions' });
    let action = menuItem(menu, 'Copy Line Reference');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.expected.oldSideSelection.reference);

    selectDiffLineText(context, addition);
    fireEvent.contextMenu(deletion);
    menu = screen.getByRole('menu', { name: 'Diff line actions' });
    action = menuItem(menu, 'Copy GitHub Permalink');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledTimes(2);
    expect(copyText).toHaveBeenNthCalledWith(
      2,
      scenario.expected.oldSideSelection.githubUrl,
    );
  });

  it('falls back to the clicked line when the selection does not include it', async () => {
    const user = userEvent.setup();
    const copyText = vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
    const file = scenario.files.renamed;
    await renderLoadedTextualDiff();
    const context = getDiffLineRow(file, scenario.lines.context);
    const addition = getDiffLineRow(file, scenario.lines.addition);

    selectDiffLineText(context);
    expect(addition).toBeVisible();
    fireEvent.contextMenu(addition);
    let menu = screen.getByRole('menu', { name: 'Diff line actions' });
    let action = menuItem(menu, 'Copy');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.lines.addition.text);

    selectDiffLineText(context);
    fireEvent.contextMenu(addition);
    menu = screen.getByRole('menu', { name: 'Diff line actions' });
    action = menuItem(menu, 'Copy Line Reference');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledTimes(2);
    expect(copyText).toHaveBeenNthCalledWith(2, scenario.expected.additionLine.reference);
  });

  it('ignores a selection that crosses diff file boundaries', async () => {
    const user = userEvent.setup();
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
    fireEvent.contextMenu(clickedRow);
    let menu = screen.getByRole('menu', { name: 'Diff line actions' });
    let action = menuItem(menu, 'Copy');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.lines.addition.text);

    selectDiffLineText(firstRow, clickedRow);
    fireEvent.contextMenu(clickedRow);
    menu = screen.getByRole('menu', { name: 'Diff line actions' });
    action = menuItem(menu, 'Copy Line Reference');
    expect(action).toBeVisible();
    await user.click(action);

    expect(copyText).toHaveBeenCalledTimes(2);
    expect(copyText).toHaveBeenNthCalledWith(2, scenario.expected.additionLine.reference);
  });
});
