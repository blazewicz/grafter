// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiffViewer } from '../../../../src/renderer/components/diff/DiffViewer';
import { api } from '../../../../src/renderer/grafter-api';
import type {
  DiffFilePatch,
  DiffFileStatus,
  DiffFileSummary,
  DiffSession,
} from '../../../../src/shared/contracts';
import { settingsFactory } from '../../../factories';
import { buildDiffViewerScenario } from '../../../scenarios/diff/diff-viewer';
import { deferred } from '../../../support/deferred';

const scenario = buildDiffViewerScenario();
const settings = settingsFactory.build();
const textualHunk = scenario.patches.textual.hunks[0];
if (!textualHunk) throw new Error('Expected the scenario to include a textual hunk.');
const detachedEditorReason =
  'Check out the source branch in a worktree to open files in an editor';
const deletedEditorReason = 'Deleted files cannot be opened in an editor';

interface ObserverRecord {
  observer: IntersectionObserver;
  callback: IntersectionObserverCallback;
  observed: Set<Element>;
  disconnected: boolean;
}

class IntersectionObserverHarness {
  private readonly records: ObserverRecord[] = [];

  readonly Observer: typeof IntersectionObserver;

  constructor() {
    const registerObserver = (
      observer: IntersectionObserver,
      callback: IntersectionObserverCallback,
    ): void => this.register(observer, callback);
    const disconnectObserver = (observer: IntersectionObserver): void =>
      this.disconnect(observer);
    const observeTarget = (observer: IntersectionObserver, target: Element): void =>
      this.observe(observer, target);
    const unobserveTarget = (observer: IntersectionObserver, target: Element): void =>
      this.unobserve(observer, target);
    this.Observer = class ControlledIntersectionObserver implements IntersectionObserver {
      readonly root: Element | Document | null;
      readonly rootMargin: string;
      readonly scrollMargin = '0px';
      readonly thresholds: readonly number[];

      constructor(
        callback: IntersectionObserverCallback,
        options: IntersectionObserverInit = {},
      ) {
        this.root = options.root ?? null;
        this.rootMargin = options.rootMargin ?? '0px';
        this.thresholds =
          typeof options.threshold === 'number'
            ? [options.threshold]
            : (options.threshold ?? [0]);
        registerObserver(this, callback);
      }

      disconnect(): void {
        disconnectObserver(this);
      }

      observe(target: Element): void {
        observeTarget(this, target);
      }

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }

      unobserve(target: Element): void {
        unobserveTarget(this, target);
      }
    };
  }

  notify(target: Element, isIntersecting: boolean): void {
    const bounds = target.getBoundingClientRect();
    const entry = {
      boundingClientRect: bounds,
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: isIntersecting ? bounds : new DOMRectReadOnly(),
      isIntersecting,
      rootBounds: null,
      target,
      time: 0,
    } satisfies IntersectionObserverEntry;

    for (const record of this.records) {
      if (!record.disconnected && record.observed.has(target)) {
        record.callback([entry], record.observer);
      }
    }
  }

  activeObserverCount(target: Element): number {
    return this.records.filter(
      (record) => !record.disconnected && record.observed.has(target),
    ).length;
  }

  disconnectedObserverCount(target: Element): number {
    return this.records.filter(
      (record) => record.disconnected && record.observed.has(target),
    ).length;
  }

  reset(): void {
    this.records.length = 0;
  }

  private register(
    observer: IntersectionObserver,
    callback: IntersectionObserverCallback,
  ): void {
    this.records.push({
      observer,
      callback,
      observed: new Set(),
      disconnected: false,
    });
  }

  private observe(observer: IntersectionObserver, target: Element): void {
    this.recordFor(observer).observed.add(target);
  }

  private unobserve(observer: IntersectionObserver, target: Element): void {
    this.recordFor(observer).observed.delete(target);
  }

  private disconnect(observer: IntersectionObserver): void {
    this.recordFor(observer).disconnected = true;
  }

  private recordFor(observer: IntersectionObserver): ObserverRecord {
    const record = this.records.find((candidate) => candidate.observer === observer);
    if (!record) throw new Error('Expected the observer to be registered.');
    return record;
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

let intersectionObservers: IntersectionObserverHarness;

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

function getFileSection(file: DiffFileSummary): HTMLElement {
  const collapseButton = screen.getByRole('button', {
    name: `Collapse ${file.path} diff`,
  });
  const section = collapseButton.closest<HTMLElement>('[data-diff-file-id]');
  if (!section) throw new Error(`Expected a diff section for ${file.path}.`);
  return section;
}

describe('DiffViewer', () => {
  beforeEach(() => {
    intersectionObservers = new IntersectionObserverHarness();
    vi.stubGlobal('IntersectionObserver', intersectionObservers.Observer);
    vi.stubGlobal('ResizeObserver', InertResizeObserver);
  });

  afterEach(() => {
    cleanup();
    intersectionObservers.reset();
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

  it('waits for intersection and deduplicates repeated patch requests', async () => {
    const request = deferred<DiffFilePatch>();
    const getDiffFile = vi.spyOn(api, 'getDiffFile').mockReturnValue(request.promise);
    const file = scenario.files.renamed;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    expect(within(fileSection).getByText('Patch will load when visible')).toBeVisible();
    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(1);
    expect(getDiffFile).not.toHaveBeenCalled();

    act(() => intersectionObservers.notify(fileSection, false));
    expect(getDiffFile).not.toHaveBeenCalled();

    act(() => {
      intersectionObservers.notify(fileSection, true);
      intersectionObservers.notify(fileSection, true);
    });

    await waitFor(() => expect(getDiffFile).toHaveBeenCalledOnce());
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
    expect(within(fileSection).getByText('Loading patch…')).toBeVisible();
  });

  it('renders a resolved textual patch with its hunk and representative lines', async () => {
    const request = deferred<DiffFilePatch>();
    const getDiffFile = vi.spyOn(api, 'getDiffFile').mockReturnValue(request.promise);
    const file = scenario.files.renamed;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    act(() => intersectionObservers.notify(fileSection, true));
    expect(within(fileSection).getByText('Loading patch…')).toBeVisible();

    await act(async () => {
      request.resolve(scenario.patches.textual);
      await request.promise;
    });

    expect(
      await within(fileSection).findByText(textualHunk.header, { selector: 'code' }),
    ).toBeVisible();
    const contextRow = within(fileSection)
      .getByText(scenario.lines.context.text, { selector: 'code' })
      .closest<HTMLElement>('[data-diff-line-id]');
    const deletionRow = within(fileSection)
      .getByText(scenario.lines.deletion.text, { selector: 'code' })
      .closest<HTMLElement>('[data-diff-line-id]');
    const additionRow = within(fileSection)
      .getByText(scenario.lines.addition.text, { selector: 'code' })
      .closest<HTMLElement>('[data-diff-line-id]');
    if (!contextRow || !deletionRow || !additionRow) {
      throw new Error('Expected the representative textual diff rows.');
    }

    expect(contextRow).toHaveTextContent(String(scenario.lines.context.oldLine));
    expect(contextRow).toHaveTextContent(String(scenario.lines.context.newLine));
    expect(deletionRow).toHaveTextContent(String(scenario.lines.deletion.oldLine));
    expect(deletionRow).toHaveTextContent('−');
    expect(additionRow).toHaveTextContent(String(scenario.lines.addition.newLine));
    expect(additionRow).toHaveTextContent('+');
    expect(
      within(fileSection).getByText(scenario.lines.annotation.text, {
        selector: 'code',
      }),
    ).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });

  it('shows a friendly file-local failure without invoking the viewer error callback', async () => {
    const remoteMessage =
      "Error invoking remote method 'diff:get-file': Error: Patch data is unavailable";
    const onError = vi.fn<(message: string) => void>();
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockRejectedValue(new Error(remoteMessage));
    const file = scenario.files.modified;
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose: () => undefined,
      onError,
    });
    const fileSection = getFileSection(file);

    act(() => intersectionObservers.notify(fileSection, true));

    expect(
      await within(fileSection).findByText('Could not load this file'),
    ).toBeVisible();
    expect(within(fileSection).getByText('Patch data is unavailable')).toBeVisible();
    expect(onError).not.toHaveBeenCalled();
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });

  it('explains a binary file from its summary before a patch request', () => {
    const getDiffFile = vi.spyOn(api, 'getDiffFile');
    const file = scenario.files.binary;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    expect(within(fileSection).getByText('Binary file changed')).toBeVisible();
    expect(
      within(fileSection).getByText(
        'Grafter cannot display a textual diff for this file.',
      ),
    ).toBeVisible();
    expect(getDiffFile).not.toHaveBeenCalled();
  });

  it('explains a binary patch when the summary did not identify binary content', async () => {
    const file = { ...scenario.files.binary, binary: false };
    const session = {
      ...scenario.branchSession,
      files: scenario.branchSession.files.map((candidate) =>
        candidate.id === file.id ? file : candidate,
      ),
    };
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockResolvedValue(scenario.patches.binary);
    renderDiffViewer(session);
    const fileSection = getFileSection(file);

    expect(within(fileSection).getByText('Patch will load when visible')).toBeVisible();
    act(() => intersectionObservers.notify(fileSection, true));

    expect(await within(fileSection).findByText('Binary file changed')).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: session.id,
      fileId: file.id,
    });
  });

  it('explains metadata-only changes when the patch has no hunks', async () => {
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockResolvedValue(scenario.patches.metadataOnly);
    const file = scenario.files.metadataOnly;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    act(() => intersectionObservers.notify(fileSection, true));

    expect(
      await within(fileSection).findByText('No textual lines changed'),
    ).toBeVisible();
    expect(
      within(fileSection).getByText('The file mode or metadata changed.'),
    ).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });

  it('loads multiple files concurrently and resolves them independently out of order', async () => {
    const textualRequest = deferred<DiffFilePatch>();
    const metadataRequest = deferred<DiffFilePatch>();
    const textualFile = scenario.files.renamed;
    const metadataFile = scenario.files.metadataOnly;
    const getDiffFile = vi.spyOn(api, 'getDiffFile').mockImplementation((request) => {
      if (request.fileId === textualFile.id) return textualRequest.promise;
      if (request.fileId === metadataFile.id) return metadataRequest.promise;
      return Promise.reject(new Error(`Unexpected patch request for ${request.fileId}`));
    });
    renderDiffViewer();
    const textualSection = getFileSection(textualFile);
    const metadataSection = getFileSection(metadataFile);

    act(() => {
      intersectionObservers.notify(textualSection, true);
      intersectionObservers.notify(metadataSection, true);
    });

    expect(within(textualSection).getByText('Loading patch…')).toBeVisible();
    expect(within(metadataSection).getByText('Loading patch…')).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledTimes(2);
    expect(getDiffFile).toHaveBeenNthCalledWith(1, {
      sessionId: scenario.branchSession.id,
      fileId: textualFile.id,
    });
    expect(getDiffFile).toHaveBeenNthCalledWith(2, {
      sessionId: scenario.branchSession.id,
      fileId: metadataFile.id,
    });

    await act(async () => {
      metadataRequest.resolve(scenario.patches.metadataOnly);
      await metadataRequest.promise;
    });
    expect(
      await within(metadataSection).findByText('No textual lines changed'),
    ).toBeVisible();
    expect(within(textualSection).getByText('Loading patch…')).toBeVisible();

    await act(async () => {
      textualRequest.resolve(scenario.patches.textual);
      await textualRequest.promise;
    });
    expect(
      await within(textualSection).findByText(textualHunk.header, {
        selector: 'code',
      }),
    ).toBeVisible();
    expect(within(metadataSection).getByText('No textual lines changed')).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledTimes(2);
  });

  it('disconnects a collapsed unrequested file and restores lazy eligibility on expand', async () => {
    const user = userEvent.setup();
    const request = deferred<DiffFilePatch>();
    const getDiffFile = vi.spyOn(api, 'getDiffFile').mockReturnValue(request.promise);
    const file = scenario.files.modified;
    renderDiffViewer();
    const fileSection = getFileSection(file);
    const collapseButton = screen.getByRole('button', {
      name: `Collapse ${file.path} diff`,
    });

    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(1);
    await user.click(collapseButton);
    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(0);
    expect(intersectionObservers.disconnectedObserverCount(fileSection)).toBe(1);

    act(() => intersectionObservers.notify(fileSection, true));
    expect(getDiffFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: `Expand ${file.path} diff` }));
    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(1);
    expect(within(fileSection).getByText('Patch will load when visible')).toBeVisible();

    act(() => intersectionObservers.notify(fileSection, true));
    await waitFor(() => expect(getDiffFile).toHaveBeenCalledOnce());
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });

  it('preserves a requested patch across collapse and expand without another request', async () => {
    const user = userEvent.setup();
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockResolvedValue(scenario.patches.textual);
    const file = scenario.files.renamed;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    act(() => intersectionObservers.notify(fileSection, true));
    expect(
      await within(fileSection).findByText(textualHunk.header, { selector: 'code' }),
    ).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: `Collapse ${file.path} diff` }));
    expect(
      within(fileSection).queryByText(textualHunk.header, { selector: 'code' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: `Expand ${file.path} diff` }));
    expect(
      within(fileSection).getByText(textualHunk.header, { selector: 'code' }),
    ).toBeVisible();
    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(1);

    act(() => intersectionObservers.notify(fileSection, true));
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });
});
