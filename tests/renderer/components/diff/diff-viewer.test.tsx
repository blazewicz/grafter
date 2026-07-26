// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiffViewer } from '../../../../src/renderer/components/diff/DiffViewer';
import { api } from '../../../../src/renderer/grafter-api';
import type { DiffFileStatus, DiffSession } from '../../../../src/shared/contracts';
import { settingsFactory } from '../../../factories';
import { buildDiffViewerScenario } from '../../../scenarios/diff/diff-viewer';

const scenario = buildDiffViewerScenario();
const settings = settingsFactory.build();
const detachedEditorReason =
  'Check out the source branch in a worktree to open files in an editor';
const deletedEditorReason = 'Deleted files cannot be opened in an editor';

class InertIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly scrollMargin = '0px';
  readonly thresholds = [];

  disconnect(): void {
    return undefined;
  }
  observe(target: Element): void {
    void target;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve(target: Element): void {
    void target;
  }
}

class InertResizeObserver implements ResizeObserver {
  disconnect(): void {
    return undefined;
  }
  observe(target: Element): void {
    void target;
  }
  unobserve(target: Element): void {
    void target;
  }
}

interface DiffViewerCallbacks {
  onSessionChange: (session: DiffSession) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

function renderDiffViewer(
  session: DiffSession = scenario.branchSession,
  callbacks: DiffViewerCallbacks = {
    onSessionChange: () => undefined,
    onClose: () => undefined,
    onError: () => undefined,
  },
): void {
  render(
    <DiffViewer
      session={session}
      settings={settings}
      systemLocale="en-US"
      {...callbacks}
    />,
  );
}

describe('DiffViewer', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', InertIntersectionObserver);
    vi.stubGlobal('ResizeObserver', InertResizeObserver);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('presents a branch comparison with exact controls and plural totals', () => {
    renderDiffViewer();

    expect(
      screen.getByRole('dialog', {
        name: `Committed changes from ${scenario.branches.source} against ${scenario.branches.target}`,
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose source branch' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(
      screen.getByRole('button', { name: 'Choose destination branch' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', {
        name: 'Swap source and destination branches',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close diff viewer' })).toBeVisible();

    const totals = screen.getByLabelText('Diff totals');
    expect(totals).toHaveTextContent('7 files');
    expect(totals).toHaveTextContent('+17');
    expect(totals).toHaveTextContent('−11');

    const file = scenario.files.modified;
    expect(screen.getByRole('button', { name: `Copy ${file.path} path` })).toBeVisible();
    expect(
      screen.getByRole('button', { name: `Collapse ${file.path} diff` }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', {
        name: `Open ${file.path} in Visual Studio Code`,
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: `Choose IDE for ${file.path}` }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('uses singular file wording in the totals', () => {
    const file = scenario.files.added;
    renderDiffViewer({
      ...scenario.branchSession,
      files: [file],
      stats: {
        files: 1,
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
      },
    });

    const totals = screen.getByLabelText('Diff totals');
    expect(totals).toHaveTextContent('1 file');
    expect(totals).not.toHaveTextContent('1 files');
    expect(totals).toHaveTextContent(`+${file.additions ?? 0}`);
    expect(totals).toHaveTextContent(`−${file.deletions ?? 0}`);
  });

  it.each([
    { status: 'added', label: 'Added', file: scenario.files.added },
    { status: 'copied', label: 'Copied', file: scenario.files.copied },
    { status: 'deleted', label: 'Deleted', file: scenario.files.deleted },
    { status: 'modified', label: 'Modified', file: scenario.files.modified },
    { status: 'renamed', label: 'Renamed', file: scenario.files.renamed },
    {
      status: 'type-changed',
      label: 'Type changed',
      file: scenario.files.metadataOnly,
    },
  ] satisfies {
    status: DiffFileStatus;
    label: string;
    file: (typeof scenario.branchSession.files)[number];
  }[])('exposes the $status status in the tree and file header', ({ label, file }) => {
    renderDiffViewer();
    const tree = screen.getByRole('navigation', { name: 'Changed file tree' });
    const collapseButton = screen.getByRole('button', {
      name: `Collapse ${file.path} diff`,
    });
    const fileHeader = collapseButton.closest('header');
    if (!fileHeader) throw new Error(`Expected a header for ${file.path}.`);
    const treeFile = within(tree).getByTitle(file.path);

    expect(within(treeFile).getByLabelText(`${label} file`)).toBeVisible();
    expect(within(fileHeader).getByLabelText(`${label} file`)).toBeVisible();
    expect(within(fileHeader).queryByText(label, { exact: true })).toBeNull();
  });

  it.each([scenario.files.copied, scenario.files.renamed])(
    'shows the previous and current paths for $status files',
    (file) => {
      renderDiffViewer();
      const collapseButton = screen.getByRole('button', {
        name: `Collapse ${file.path} diff`,
      });
      const fileHeader = collapseButton.closest('header');
      if (!fileHeader || !file.previousPath) {
        throw new Error(`Expected both paths in the header for ${file.path}.`);
      }

      expect(
        within(fileHeader).getByText(file.previousPath, { selector: 'code' }),
      ).toBeVisible();
      expect(within(fileHeader).getByText(file.path, { selector: 'code' })).toBeVisible();
    },
  );

  it('retains branch controls and explains disabled editor actions for a detached session', () => {
    renderDiffViewer(scenario.detachedBranchSession);

    expect(screen.getByRole('button', { name: 'Choose source branch' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Choose destination branch' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Swap source and destination branches',
      }),
    ).toBeVisible();

    for (const file of scenario.detachedBranchSession.files) {
      const reason =
        file.status === 'deleted' ? deletedEditorReason : detachedEditorReason;
      const editorButtons = screen.getAllByRole('button', {
        name: `${file.path}: ${reason}`,
      });
      expect(editorButtons).toHaveLength(2);
      for (const button of editorButtons) expect(button).toBeDisabled();
      expect(editorButtons[1]).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('presents commit identity and omits branch and editor controls', () => {
    const commitSession = {
      ...scenario.commitSession,
      commit: {
        ...scenario.commitSession.commit,
        authoredAt: '2026-07-21T12:30:00',
      },
    };
    renderDiffViewer(commitSession);

    expect(
      screen.getByRole('dialog', {
        name: `Changes in commit ${commitSession.commit.hash}`,
      }),
    ).toBeVisible();
    expect(screen.getByTitle(commitSession.commit.hash)).toHaveTextContent(
      commitSession.commit.hash.slice(0, 7),
    );
    expect(screen.getByRole('button', { name: 'Copy full commit hash' })).toBeVisible();
    expect(screen.getByText(commitSession.commit.title)).toBeVisible();
    expect(screen.getByText(commitSession.commit.authorName)).toBeVisible();
    expect(screen.getByText('2026-07-21 at 12:30')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show commit details' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'Choose source branch' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Choose destination branch' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: /Open .+ in Visual Studio Code|Choose IDE for/,
      }),
    ).toBeNull();
  });

  it('uses the untitled fallback for a commit without a title', () => {
    renderDiffViewer({
      ...scenario.commitSession,
      commit: {
        ...scenario.commitSession.commit,
        title: '',
      },
    });

    expect(screen.getByText('Untitled commit')).toBeVisible();
  });

  it('shows directories before files in the initial visible tree order', () => {
    renderDiffViewer();
    const tree = screen.getByRole('navigation', { name: 'Changed file tree' });
    const visibleFilePaths = within(tree)
      .getAllByRole('button')
      .flatMap((button) => (button.title ? [button.title] : []));

    expect(visibleFilePaths).toEqual([
      scenario.files.binary.path,
      scenario.files.metadataOnly.path,
      scenario.files.added.path,
      scenario.files.modified.path,
      scenario.files.deleted.path,
      scenario.files.copied.path,
      scenario.files.renamed.path,
    ]);
  });

  it('collapses and expands directories with the public expanded state', async () => {
    const user = userEvent.setup();
    renderDiffViewer();
    const tree = screen.getByRole('navigation', { name: 'Changed file tree' });
    const sourceDirectory = screen.getByRole('button', { name: 'src' });

    expect(sourceDirectory).toHaveAttribute('aria-expanded', 'true');
    expect(within(tree).getByTitle(scenario.files.modified.path)).toBeVisible();

    await user.click(sourceDirectory);
    expect(sourceDirectory).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree).queryByTitle(scenario.files.modified.path)).toBeNull();

    await user.click(sourceDirectory);
    expect(sourceDirectory).toHaveAttribute('aria-expanded', 'true');
    expect(within(tree).getByTitle(scenario.files.modified.path)).toBeVisible();
  });

  it('filters case-insensitively by current path and restores files when replaced or cleared', async () => {
    const user = userEvent.setup();
    renderDiffViewer();
    const tree = screen.getByRole('navigation', { name: 'Changed file tree' });
    const filter = screen.getByRole('textbox', { name: 'Filter changed files' });

    await user.type(filter, 'NEWDIFFPANEL');
    expect(screen.getByText('1 of 7 files')).toBeVisible();
    expect(within(tree).getByTitle(scenario.files.added.path)).toBeVisible();
    expect(within(tree).queryByTitle(scenario.files.modified.path)).toBeNull();

    await user.clear(filter);
    await user.type(filter, 'SETUP-DIFF');
    expect(screen.getByText('1 of 7 files')).toBeVisible();
    expect(within(tree).getByTitle(scenario.files.metadataOnly.path)).toBeVisible();
    expect(within(tree).queryByTitle(scenario.files.added.path)).toBeNull();

    await user.clear(filter);
    expect(screen.getByText('7 of 7 files')).toBeVisible();
    expect(within(tree).getByTitle(scenario.files.added.path)).toBeVisible();
    expect(within(tree).getByTitle(scenario.files.modified.path)).toBeVisible();
  });

  it('filters renamed files by previous path and shows both paths', async () => {
    const user = userEvent.setup();
    renderDiffViewer();
    const tree = screen.getByRole('navigation', { name: 'Changed file tree' });

    await user.type(
      screen.getByRole('textbox', { name: 'Filter changed files' }),
      'DIFF-TYPES',
    );

    expect(screen.getByText('1 of 7 files')).toBeVisible();
    expect(within(tree).getByTitle(scenario.files.renamed.path)).toBeVisible();
    expect(
      screen.getByText(scenario.files.renamed.previousPath ?? '', {
        selector: 'code',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(scenario.files.renamed.path, { selector: 'code' }),
    ).toBeVisible();
  });

  it('forces matching directory paths visible while preserving collapsed state', async () => {
    const user = userEvent.setup();
    renderDiffViewer();
    const tree = screen.getByRole('navigation', { name: 'Changed file tree' });
    const sourceDirectory = screen.getByRole('button', { name: 'src' });
    await user.click(sourceDirectory);
    expect(sourceDirectory).toHaveAttribute('aria-expanded', 'false');

    const filter = screen.getByRole('textbox', { name: 'Filter changed files' });
    await user.type(filter, 'diff-types');
    expect(sourceDirectory).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'shared' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(tree).getByTitle(scenario.files.renamed.path)).toBeVisible();

    await user.clear(filter);
    expect(sourceDirectory).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree).queryByTitle(scenario.files.renamed.path)).toBeNull();
  });

  it('distinguishes no matches in the sidebar and diff pane', async () => {
    const user = userEvent.setup();
    const query = 'path-that-does-not-exist';
    renderDiffViewer();

    await user.type(screen.getByRole('textbox', { name: 'Filter changed files' }), query);

    expect(screen.getByText('No matching files')).toBeVisible();
    expect(screen.getByText(`No files match “${query}”`)).toBeVisible();
    expect(screen.queryByText('No changed files')).toBeNull();
  });

  it.each([
    {
      kind: 'branch',
      message: 'These branches have no committed changes',
    },
    {
      kind: 'commit',
      message: 'This commit has no file changes',
    },
  ] as const)('shows the distinct empty $kind session message', ({ kind, message }) => {
    const emptyStats = { files: 0, additions: 0, deletions: 0 };
    const session: DiffSession =
      kind === 'branch'
        ? {
            ...scenario.branchSession,
            files: [],
            stats: emptyStats,
          }
        : {
            ...scenario.commitSession,
            files: [],
            stats: emptyStats,
            commit: {
              ...scenario.commitSession.commit,
              stats: emptyStats,
            },
          };

    renderDiffViewer(session);

    expect(screen.getByText('No changed files')).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByText('No matching files')).toBeNull();
    expect(screen.queryByText(/No files match/)).toBeNull();
  });

  it('selects a tree file and keeps it current while its smooth jump is pending', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    renderDiffViewer();
    const tree = screen.getByRole('navigation', { name: 'Changed file tree' });
    const target = within(tree).getByTitle(scenario.files.renamed.path);

    expect(target).not.toHaveAttribute('aria-current');
    await user.click(target);

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(target).toHaveAttribute('aria-current', 'true');
  });

  it('collapses and expands an individual file patch', async () => {
    const user = userEvent.setup();
    const file = scenario.files.modified;
    renderDiffViewer();
    const collapseButton = screen.getByRole('button', {
      name: `Collapse ${file.path} diff`,
    });
    const fileSection = collapseButton.closest('section');
    if (!fileSection) throw new Error(`Expected a file section for ${file.path}.`);

    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
    expect(within(fileSection).getByText('Patch will load when visible')).toBeVisible();

    await user.click(collapseButton);
    const expandButton = screen.getByRole('button', {
      name: `Expand ${file.path} diff`,
    });
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    expect(within(fileSection).queryByText('Patch will load when visible')).toBeNull();

    await user.click(expandButton);
    expect(
      screen.getByRole('button', { name: `Collapse ${file.path} diff` }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(within(fileSection).getByText('Patch will load when visible')).toBeVisible();
  });

  it('keeps presentation observers inert without requesting patches', () => {
    const getDiffFile = vi.spyOn(api, 'getDiffFile');

    renderDiffViewer();

    expect(getDiffFile).not.toHaveBeenCalled();
  });
});
