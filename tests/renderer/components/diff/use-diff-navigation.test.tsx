// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  diffFileElementId,
  useDiffNavigation,
} from '../../../../src/renderer/components/diff/useDiffNavigation';
import type { DiffFileSummary } from '../../../../src/shared/contracts';
import { buildDiffViewerScenario } from '../../../scenarios/diff/diff-viewer';
import {
  installAnimationFrameHarness,
  type AnimationFrameHarness,
  type ResizeObserverHarness,
  ResizeObserverHarness as ControlledResizeObservers,
  stubDiffPaneGeometry,
  stubElementTop,
} from './diff-observer-harness';

const scenario = buildDiffViewerScenario();
const navigationFiles = {
  first: scenario.files.added,
  second: scenario.files.modified,
  last: scenario.files.renamed,
};
const files = [navigationFiles.first, navigationFiles.second, navigationFiles.last];

function NavigationHarness({
  orderedFiles,
  loading,
}: {
  orderedFiles: DiffFileSummary[];
  loading: ReadonlySet<string>;
}): React.JSX.Element {
  const { diffPaneRef, displayedActiveFileId, selectFile } = useDiffNavigation(
    orderedFiles,
    loading,
  );
  return (
    <>
      <nav aria-label="Changed files">
        {orderedFiles.map((file) => (
          <button
            key={file.id}
            aria-current={displayedActiveFileId === file.id ? 'true' : undefined}
            onClick={() => selectFile(file.id)}
          >
            {file.path}
          </button>
        ))}
      </nav>
      <div ref={diffPaneRef} data-testid="diff-pane">
        {orderedFiles.map((file) => (
          <section
            key={file.id}
            id={diffFileElementId(file.id)}
            data-diff-file-id={file.id}
          >
            {file.path}
          </section>
        ))}
      </div>
    </>
  );
}

function renderNavigation(
  orderedFiles: DiffFileSummary[] = files,
  loading: ReadonlySet<string> = new Set(),
): RenderResult {
  return render(<NavigationHarness orderedFiles={orderedFiles} loading={loading} />);
}

function pane(): HTMLElement {
  return screen.getByTestId('diff-pane');
}

function section(file: DiffFileSummary): HTMLElement {
  const element = document.getElementById(diffFileElementId(file.id));
  if (!element) throw new Error(`Expected a section for ${file.path}.`);
  return element;
}

function fileButton(file: DiffFileSummary): HTMLElement {
  return screen.getByRole('button', { name: file.path });
}

function stubGeometry(
  positions: readonly [
    number | (() => number),
    number | (() => number),
    number | (() => number),
  ],
): void {
  const diffPane = pane();
  stubDiffPaneGeometry(diffPane, {
    top: 100,
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 500,
    scrollPaddingTop: 10,
  });
  for (const [index, file] of files.entries()) {
    const top = positions[index];
    if (top === undefined) throw new Error('Expected geometry for every file.');
    stubElementTop(section(file), top);
  }
}

let animationFrames: AnimationFrameHarness;
let resizeObservers: ResizeObserverHarness;

describe('useDiffNavigation', () => {
  beforeEach(() => {
    resizeObservers = new ControlledResizeObservers();
    vi.stubGlobal('ResizeObserver', resizeObservers.Observer);
    animationFrames = installAnimationFrameHarness();
  });

  afterEach(() => {
    cleanup();
    resizeObservers.reset();
    animationFrames.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('tracks the closest file without activating a later file too early', () => {
    renderNavigation();
    let secondTop = 171;
    stubGeometry([130, () => secondTop, 320]);

    fireEvent.scroll(pane());
    expect(fileButton(navigationFiles.first)).toHaveAttribute('aria-current', 'true');
    expect(fileButton(navigationFiles.second)).not.toHaveAttribute('aria-current');

    secondTop = 169;
    fireEvent.scroll(pane());
    expect(fileButton(navigationFiles.second)).toHaveAttribute('aria-current', 'true');
    expect(fileButton(navigationFiles.first)).not.toHaveAttribute('aria-current');
  });

  it('falls back to the first displayed file when the ordered files change', () => {
    const { rerender } = renderNavigation();
    stubGeometry([120, 140, 160]);
    fireEvent.scroll(pane());
    expect(fileButton(navigationFiles.last)).toHaveAttribute('aria-current', 'true');

    rerender(
      <NavigationHarness orderedFiles={[navigationFiles.first]} loading={new Set()} />,
    );

    expect(fileButton(navigationFiles.first)).toHaveAttribute('aria-current', 'true');
  });

  it('starts a smooth jump and realigns after an earlier file resizes', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    renderNavigation();
    const diffPane = pane();
    stubGeometry([100, 260, () => 500 - diffPane.scrollTop]);

    await user.click(fileButton(navigationFiles.last));

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(fileButton(navigationFiles.last)).toHaveAttribute('aria-current', 'true');
    expect(resizeObservers.activeObserverCount(section(navigationFiles.first))).toBe(1);
    expect(resizeObservers.activeObserverCount(section(navigationFiles.last))).toBe(1);

    act(() => {
      resizeObservers.notify(section(navigationFiles.first));
      resizeObservers.notify(section(navigationFiles.first));
      animationFrames.flushNext();
    });

    expect(diffPane.scrollTop).toBe(390);
  });

  it.each([
    { name: 'wheel', cancel: (element: HTMLElement) => fireEvent.wheel(element) },
    {
      name: 'pointer input',
      cancel: (element: HTMLElement) => fireEvent.pointerDown(element),
    },
    {
      name: 'touch input',
      cancel: (element: HTMLElement) => fireEvent.touchStart(element),
    },
    {
      name: 'navigation key',
      cancel: (element: HTMLElement) => fireEvent.keyDown(element, { key: 'PageDown' }),
    },
  ])('cancels pending automatic alignment on $name', async ({ cancel }) => {
    const user = userEvent.setup();
    renderNavigation();
    stubGeometry([120, 300, 420]);

    await user.click(fileButton(navigationFiles.last));
    expect(fileButton(navigationFiles.last)).toHaveAttribute('aria-current', 'true');

    cancel(pane());
    fireEvent.scroll(pane());

    expect(fileButton(navigationFiles.first)).toHaveAttribute('aria-current', 'true');
    expect(fileButton(navigationFiles.last)).not.toHaveAttribute('aria-current');
  });

  it('replaces an earlier pending target and disconnects its observer', async () => {
    const user = userEvent.setup();
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    renderNavigation();

    await user.click(fileButton(navigationFiles.second));
    expect(resizeObservers.activeObserverCount(section(navigationFiles.second))).toBe(1);

    await user.click(fileButton(navigationFiles.last));

    expect(
      resizeObservers.disconnectedObserverCount(section(navigationFiles.second)),
    ).toBe(1);
    expect(resizeObservers.activeObserverCount(section(navigationFiles.last))).toBe(1);
    expect(fileButton(navigationFiles.last)).toHaveAttribute('aria-current', 'true');
  });

  it('disconnects observers and cancels alignment work on unmount', () => {
    vi.useFakeTimers();
    animationFrames = installAnimationFrameHarness();
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    const { unmount } = renderNavigation();
    const diffPane = pane();
    stubGeometry([120, 260, () => 500 - diffPane.scrollTop]);

    fireEvent.click(fileButton(navigationFiles.last));
    act(() => {
      resizeObservers.notify(section(navigationFiles.last));
      resizeObservers.notify(section(navigationFiles.last));
    });
    expect(animationFrames.pendingCount()).toBe(1);

    unmount();

    expect(animationFrames.pendingCount()).toBe(0);
    expect(animationFrames.cancelledCount()).toBe(1);
    expect(resizeObservers.activeObserverCount()).toBe(0);
    expect(resizeObservers.disconnectedObserverCount()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
