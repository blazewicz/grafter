// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiffFilesPane } from '../../../src/renderer/diff/DiffFilesPane';
import { api } from '../../../src/renderer/grafter-api';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';
import { deferred } from '../../support/deferred';
import {
  installDiffViewerObservers,
  type IntersectionObserverHarness,
} from './diff-observer-harness';

const scenario = buildDiffViewerScenario();
const detachedEditorReason =
  'Check out the source branch in a worktree to open files in an editor';

type DiffFilesPaneProps = ComponentProps<typeof DiffFilesPane>;
type DiffFilesPaneHarnessProps = Omit<DiffFilesPaneProps, 'scrollRoot'>;

function DiffFilesPaneHarness(props: DiffFilesPaneHarnessProps): React.JSX.Element {
  const scrollRoot = useRef<HTMLDivElement>(null);
  return <DiffFilesPane {...props} scrollRoot={scrollRoot} />;
}

function paneProps(
  overrides: Partial<DiffFilesPaneHarnessProps> = {},
): DiffFilesPaneHarnessProps {
  return {
    session: scenario.branchSession,
    files: [scenario.files.modified],
    patches: new Map(),
    loading: new Set(),
    fileErrors: new Map(),
    filtering: false,
    query: '',
    contextLineId: undefined,
    onVisible: () => undefined,
    onScroll: () => undefined,
    onLineContextMenu: () => undefined,
    onError: () => undefined,
    ...overrides,
  };
}

function renderDiffFilesPane(
  props: DiffFilesPaneHarnessProps = paneProps(),
): RenderResult {
  return render(<DiffFilesPaneHarness {...props} />);
}

let intersectionObservers: IntersectionObserverHarness;

describe('DiffFilesPane', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    cleanup();
    intersectionObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps file collapse state while filtering temporarily removes the file', async () => {
    const user = userEvent.setup();
    const file = scenario.files.modified;
    const initialProps = paneProps();
    const result = renderDiffFilesPane(initialProps);

    await user.click(screen.getByRole('button', { name: `Collapse ${file.path} diff` }));
    expect(
      screen.getByRole('button', { name: `Expand ${file.path} diff` }),
    ).toBeVisible();
    expect(screen.queryByText('Patch will load when visible')).toBeNull();

    result.rerender(
      <DiffFilesPaneHarness
        {...paneProps({ files: [], filtering: true, query: 'not-present' })}
      />,
    );
    expect(screen.getByText('No files match “not-present”')).toBeVisible();

    result.rerender(<DiffFilesPaneHarness {...initialProps} />);
    expect(
      screen.getByRole('button', { name: `Expand ${file.path} diff` }),
    ).toBeVisible();
    expect(screen.queryByText('Patch will load when visible')).toBeNull();

    await user.click(screen.getByRole('button', { name: `Expand ${file.path} diff` }));
    expect(screen.getByText('Patch will load when visible')).toBeVisible();
  });

  it('copies a file path, restarts feedback, and clears its timer on unmount', async () => {
    const user = userEvent.setup();
    const firstCopy = deferred<void>();
    const secondCopy = deferred<void>();
    const copyText = vi
      .spyOn(api, 'copyText')
      .mockReturnValueOnce(firstCopy.promise)
      .mockReturnValueOnce(secondCopy.promise);
    const file = scenario.files.modified;
    const { unmount } = renderDiffFilesPane();

    await user.click(screen.getByRole('button', { name: `Copy ${file.path} path` }));
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(file.path);

    vi.useFakeTimers();
    await act(async () => {
      firstCopy.resolve(undefined);
      await firstCopy.promise;
    });
    expect(screen.getByRole('button', { name: 'File path copied' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'File path copied' }));
    await act(async () => {
      secondCopy.resolve(undefined);
      await secondCopy.promise;
    });
    expect(copyText).toHaveBeenCalledTimes(2);
    expect(copyText).toHaveBeenNthCalledWith(2, file.path);
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1599);
    });
    expect(screen.getByRole('button', { name: 'File path copied' })).toBeVisible();

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not publish copy feedback when the request settles after unmount', async () => {
    vi.useFakeTimers();
    const copyResult = deferred<void>();
    vi.spyOn(api, 'copyText').mockReturnValue(copyResult.promise);
    const file = scenario.files.modified;
    const { unmount } = renderDiffFilesPane();

    fireEvent.click(screen.getByRole('button', { name: `Copy ${file.path} path` }));
    unmount();
    await act(async () => {
      copyResult.resolve(undefined);
      await copyResult.promise;
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a friendly file-copy failure', async () => {
    const user = userEvent.setup();
    const file = scenario.files.modified;
    const copyText = vi
      .spyOn(api, 'copyText')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:copy-text': Error: failed"),
      );
    const onError = vi.fn();
    renderDiffFilesPane(paneProps({ onError }));

    await user.click(screen.getByRole('button', { name: `Copy ${file.path} path` }));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith('failed');
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(file.path);
  });

  it('opens a file directly in the selected editor and reports failures', async () => {
    const user = userEvent.setup();
    const file = scenario.files.modified;
    const openDiffFileInEditor = vi
      .spyOn(api, 'openDiffFileInEditor')
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'grafter:open-diff-file': Error: editor failed",
        ),
      );
    const onError = vi.fn();
    renderDiffFilesPane(paneProps({ onError }));

    await user.click(
      screen.getByRole('button', {
        name: `Open ${file.path} in Visual Studio Code`,
      }),
    );

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith('editor failed');
    expect(openDiffFileInEditor).toHaveBeenCalledOnce();
    expect(openDiffFileInEditor).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
      editor: 'vscode',
    });
  });

  it('derives editor availability from the session', () => {
    const file = scenario.files.modified;
    const { rerender } = renderDiffFilesPane(
      paneProps({ session: scenario.detachedBranchSession }),
    );

    const detachedControls = screen.getAllByRole('button', {
      name: `${file.path}: ${detachedEditorReason}`,
    });
    expect(detachedControls).toHaveLength(2);
    for (const control of detachedControls) expect(control).toBeDisabled();

    rerender(
      <DiffFilesPaneHarness {...paneProps({ session: scenario.commitSession })} />,
    );
    expect(
      screen.queryByRole('button', {
        name: /Open .+ in Visual Studio Code|Choose IDE for/,
      }),
    ).toBeNull();
  });

  it.each([
    {
      name: 'filtered files',
      props: paneProps({ files: [], filtering: true, query: 'missing.ts' }),
      message: 'No files match “missing.ts”',
    },
    {
      name: 'empty branch comparison',
      props: paneProps({ files: [] }),
      message: 'These branches have no committed changes',
    },
    {
      name: 'empty commit',
      props: paneProps({ session: scenario.commitSession, files: [] }),
      message: 'This commit has no file changes',
    },
  ])('renders the $name state', ({ props, message }) => {
    renderDiffFilesPane(props);

    expect(screen.getByText(message)).toBeVisible();
  });
});
