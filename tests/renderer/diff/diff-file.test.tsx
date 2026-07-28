// @vitest-environment happy-dom

import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiffFile } from '../../../src/renderer/diff/DiffFile';
import type {
  DiffFilePatch,
  DiffFileSummary,
  DiffLine,
  EditorTool,
} from '../../../src/shared/contracts';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';
import {
  installDiffViewerObservers,
  type IntersectionObserverHarness,
} from './diff-observer-harness';

const scenario = buildDiffViewerScenario();
const detachedEditorReason =
  'Check out the source branch in a worktree to open files in an editor';
const deletedEditorReason = 'Deleted files cannot be opened in an editor';

interface DiffFileCallbacks {
  onVisible: (file: DiffFileSummary) => void;
  onCopy: () => void;
  onOpenInEditor: (editor: EditorTool) => void;
  onToggle: () => void;
  onLineContextMenu: (event: React.MouseEvent<HTMLDivElement>, line: DiffLine) => void;
}

const callbacks = (): DiffFileCallbacks => ({
  onVisible: vi.fn(),
  onCopy: vi.fn(),
  onOpenInEditor: vi.fn(),
  onToggle: vi.fn(),
  onLineContextMenu: vi.fn(),
});

function renderDiffFile({
  file = scenario.files.modified,
  patch,
  loading = false,
  error,
  copied = false,
  expanded = true,
  editorAvailable = true,
  showEditorControls = true,
  nextCallbacks = callbacks(),
}: {
  file?: DiffFileSummary;
  patch?: DiffFilePatch;
  loading?: boolean;
  error?: string;
  copied?: boolean;
  expanded?: boolean;
  editorAvailable?: boolean;
  showEditorControls?: boolean;
  nextCallbacks?: DiffFileCallbacks;
} = {}): DiffFileCallbacks {
  const scrollRoot = createRef<HTMLDivElement>();
  render(
    <div ref={scrollRoot}>
      <DiffFile
        file={file}
        patch={patch}
        loading={loading}
        error={error}
        copied={copied}
        contextLineId={undefined}
        expanded={expanded}
        editorAvailable={editorAvailable}
        showEditorControls={showEditorControls}
        scrollRoot={scrollRoot}
        {...nextCallbacks}
      />
    </div>,
  );
  return nextCallbacks;
}

function fileSection(file: DiffFileSummary = scenario.files.modified): HTMLElement {
  const section = screen
    .getByTitle(file.path)
    .closest<HTMLElement>('[data-diff-file-id]');
  if (!section) throw new Error(`Expected the ${file.path} diff section.`);
  return section;
}

let intersectionObservers: IntersectionObserverHarness;

describe('DiffFile', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    cleanup();
    intersectionObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a textual patch and forwards line context-menu actions', () => {
    const nextCallbacks = callbacks();
    renderDiffFile({
      file: scenario.files.renamed,
      patch: scenario.patches.textual,
      nextCallbacks,
    });
    const patch = scenario.patches.textual;
    const firstLine = patch.hunks[0]?.lines[0];
    if (!firstLine) throw new Error('Expected a representative diff line.');

    expect(screen.getByText(patch.hunks[0]?.header ?? '')).toBeVisible();
    const lineCode = screen.getByText(firstLine.text);
    expect(lineCode).toBeVisible();
    const lineRow = lineCode.closest('div');
    if (!lineRow) throw new Error('Expected a representative diff row.');
    fireEvent.contextMenu(lineRow);

    expect(nextCallbacks.onLineContextMenu).toHaveBeenCalledOnce();
    expect(nextCallbacks.onLineContextMenu).toHaveBeenCalledWith(
      expect.any(Object),
      firstLine,
      undefined,
    );
  });

  it.each([
    {
      name: 'file-local failure',
      props: { error: 'Could not read the patch' },
      heading: 'Could not load this file',
      detail: 'Could not read the patch',
    },
    {
      name: 'binary summary',
      props: { file: scenario.files.binary },
      heading: 'Binary file changed',
      detail: 'Grafter cannot display a textual diff for this file.',
    },
    {
      name: 'binary patch',
      props: { patch: scenario.patches.binary },
      heading: 'Binary file changed',
      detail: 'Grafter cannot display a textual diff for this file.',
    },
    {
      name: 'metadata-only patch',
      props: { patch: scenario.patches.metadataOnly },
      heading: 'No textual lines changed',
      detail: 'The file mode or metadata changed.',
    },
  ])('renders the $name state', ({ props, heading, detail }) => {
    renderDiffFile(props);

    expect(screen.getByText(heading)).toBeVisible();
    expect(screen.getByText(detail)).toBeVisible();
  });

  it('requests its patch only after the expanded file becomes visible', () => {
    const nextCallbacks = callbacks();
    renderDiffFile({ nextCallbacks });
    const section = fileSection();

    expect(nextCallbacks.onVisible).not.toHaveBeenCalled();
    intersectionObservers.notify(section, true);

    expect(nextCallbacks.onVisible).toHaveBeenCalledOnce();
    expect(nextCallbacks.onVisible).toHaveBeenCalledWith(scenario.files.modified);
  });

  it('does not observe a collapsed file and forwards its expand action', async () => {
    const user = userEvent.setup();
    const nextCallbacks = callbacks();
    renderDiffFile({ expanded: false, nextCallbacks });
    const section = fileSection();

    expect(intersectionObservers.activeObserverCount(section)).toBe(0);
    await user.click(
      screen.getByRole('button', {
        name: `Expand ${scenario.files.modified.path} diff`,
      }),
    );

    expect(nextCallbacks.onToggle).toHaveBeenCalledOnce();
  });

  it('forwards copy and direct editor actions', async () => {
    const user = userEvent.setup();
    const nextCallbacks = callbacks();
    const file = scenario.files.modified;
    renderDiffFile({ nextCallbacks });

    await user.click(screen.getByRole('button', { name: `Copy ${file.path} path` }));
    await user.click(
      screen.getByRole('button', {
        name: `Open ${file.path} in Visual Studio Code`,
      }),
    );

    expect(nextCallbacks.onCopy).toHaveBeenCalledOnce();
    expect(nextCallbacks.onOpenInEditor).toHaveBeenCalledOnce();
    expect(nextCallbacks.onOpenInEditor).toHaveBeenCalledWith('vscode');
  });

  it('chooses an editor through a semantic menu', async () => {
    const user = userEvent.setup();
    const nextCallbacks = callbacks();
    const file = scenario.files.modified;
    renderDiffFile({ nextCallbacks });
    const pickerButton = screen.getByRole('button', {
      name: `Choose IDE for ${file.path}`,
    });

    expect(pickerButton).toHaveAttribute('aria-haspopup', 'menu');
    expect(pickerButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(pickerButton);

    expect(pickerButton).toHaveAttribute('aria-expanded', 'true');
    const editorOption = screen.getByRole('menuitem', { name: 'Visual Studio Code' });
    expect(editorOption).toBeVisible();

    await user.click(editorOption);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(pickerButton).toHaveAttribute('aria-expanded', 'false');
    expect(nextCallbacks.onOpenInEditor).toHaveBeenCalledOnce();
    expect(nextCallbacks.onOpenInEditor).toHaveBeenCalledWith('vscode');
  });

  it('closes the editor menu with Escape without choosing an editor', async () => {
    const user = userEvent.setup();
    const nextCallbacks = callbacks();
    const file = scenario.files.modified;
    renderDiffFile({ nextCallbacks });
    const pickerButton = screen.getByRole('button', {
      name: `Choose IDE for ${file.path}`,
    });

    await user.click(pickerButton);
    expect(screen.getByRole('menu')).toBeVisible();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(pickerButton).toHaveAttribute('aria-expanded', 'false');
    expect(nextCallbacks.onOpenInEditor).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'detached source',
      file: scenario.files.modified,
      editorAvailable: false,
      reason: detachedEditorReason,
    },
    {
      name: 'deleted file',
      file: scenario.files.deleted,
      editorAvailable: true,
      reason: deletedEditorReason,
    },
  ])(
    'explains disabled editor controls for a $name',
    ({ file, editorAvailable, reason }) => {
      renderDiffFile({ file, editorAvailable });

      const editorControls = screen.getAllByRole('button', {
        name: `${file.path}: ${reason}`,
      });
      expect(editorControls).toHaveLength(2);
      for (const control of editorControls) expect(control).toBeDisabled();
    },
  );

  it('omits editor controls when the parent session does not support them', () => {
    renderDiffFile({ showEditorControls: false });

    expect(
      screen.queryByRole('button', {
        name: `Choose IDE for ${scenario.files.modified.path}`,
      }),
    ).toBeNull();
  });

  it('marks the active line context-menu anchor', () => {
    const patch = scenario.patches.textual;
    const file = scenario.files.renamed;
    render(
      <DiffFile
        file={file}
        patch={patch}
        loading={false}
        error={undefined}
        copied={false}
        contextLineId={`${file.id}:0:0`}
        expanded
        editorAvailable
        showEditorControls
        scrollRoot={createRef<HTMLDivElement>()}
        {...callbacks()}
      />,
    );
    const firstLine = patch.hunks[0]?.lines[0];
    if (!firstLine) throw new Error('Expected a representative diff line.');
    const row = screen
      .getByText(firstLine.text)
      .closest<HTMLElement>('[data-diff-line-id]');
    if (!row) throw new Error('Expected the representative diff row.');

    expect(row).toHaveAttribute('data-context-menu-anchor', 'true');
    const event = createEvent.contextMenu(row);
    fireEvent(row, event);
    expect(event.defaultPrevented).toBe(false);
  });
});
