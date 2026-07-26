// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../../src/renderer/grafter-api';
import type { DiffFilePatch, DiffFileSummary } from '../../../../src/shared/contracts';
import { deferred } from '../../../support/deferred';
import {
  getDiffPane,
  getFileSection,
  installAnimationFrameHarness,
  installDiffViewerObservers,
  type AnimationFrameHarness,
  type IntersectionObserverHarness,
  renderDiffViewer,
  type ResizeObserverHarness,
  ResizeObserverHarness as ControlledResizeObservers,
  scenario,
  stubDiffPaneGeometry,
  stubElementTop,
} from './diff-viewer-test-harness';

const files = {
  first: scenario.files.added,
  second: scenario.files.modified,
  last: scenario.files.renamed,
};
const scrollSession = {
  ...scenario.branchSession,
  files: [files.second, files.first, files.last],
  stats: {
    files: 3,
    additions:
      (files.first.additions ?? 0) +
      (files.second.additions ?? 0) +
      (files.last.additions ?? 0),
    deletions:
      (files.first.deletions ?? 0) +
      (files.second.deletions ?? 0) +
      (files.last.deletions ?? 0),
  },
};

let animationFrames: AnimationFrameHarness;
let intersectionObservers: IntersectionObserverHarness;
let resizeObservers: ResizeObserverHarness;

function treeFile(file: DiffFileSummary): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Changed file tree' })).getByTitle(
    file.path,
  );
}

function stubActiveFileGeometry(
  pane: HTMLElement,
  positions: {
    first: number | (() => number);
    second: number | (() => number);
    last: number | (() => number);
  },
): void {
  stubDiffPaneGeometry(pane, {
    top: 100,
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 500,
    scrollPaddingTop: 10,
  });
  stubElementTop(getFileSection(files.first), positions.first);
  stubElementTop(getFileSection(files.second), positions.second);
  stubElementTop(getFileSection(files.last), positions.last);
}

function cancelAutomaticAlignment(pane: HTMLElement, eventName: string): void {
  if (eventName === 'wheel') fireEvent.wheel(pane);
  else if (eventName === 'pointer') fireEvent.pointerDown(pane);
  else if (eventName === 'touch') fireEvent.touchStart(pane);
  else fireEvent.keyDown(pane, { key: 'PageDown' });
}

describe('DiffViewer active-file tracking', () => {
  beforeEach(() => {
    resizeObservers = new ControlledResizeObservers();
    intersectionObservers = installDiffViewerObservers(resizeObservers);
    animationFrames = installAnimationFrameHarness();
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    cleanup();
    intersectionObservers.reset();
    resizeObservers.reset();
    animationFrames.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('tracks the closest file header without activating a later file too early', () => {
    renderDiffViewer(scrollSession);
    const pane = getDiffPane(files.first);
    let secondTop = 171;
    stubActiveFileGeometry(pane, {
      first: 130,
      second: () => secondTop,
      last: 320,
    });

    fireEvent.scroll(pane);
    expect(treeFile(files.first)).toHaveAttribute('aria-current', 'true');
    expect(treeFile(files.second)).not.toHaveAttribute('aria-current');

    secondTop = 169;
    fireEvent.scroll(pane);
    expect(treeFile(files.second)).toHaveAttribute('aria-current', 'true');
    expect(treeFile(files.first)).not.toHaveAttribute('aria-current');
  });

  it('falls back to the first displayed file when filtering removes the active file', async () => {
    const user = userEvent.setup();
    renderDiffViewer(scrollSession);
    const pane = getDiffPane(files.first);
    stubActiveFileGeometry(pane, {
      first: 80,
      second: 120,
      last: 160,
    });

    fireEvent.scroll(pane);
    expect(treeFile(files.last)).toHaveAttribute('aria-current', 'true');

    await user.type(
      screen.getByRole('textbox', { name: 'Filter changed files' }),
      'NewDiffPanel',
    );

    expect(treeFile(files.first)).toHaveAttribute('aria-current', 'true');
  });

  it('remains stable when filtering leaves no file element', async () => {
    const user = userEvent.setup();
    renderDiffViewer(scrollSession);
    const pane = getDiffPane(files.first);
    stubActiveFileGeometry(pane, {
      first: 120,
      second: 240,
      last: 360,
    });

    await user.type(
      screen.getByRole('textbox', { name: 'Filter changed files' }),
      'no-such-diff-file',
    );
    fireEvent.scroll(pane);

    expect(screen.getByText('No matching files')).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: 'Changed file tree' })).queryByRole(
        'button',
        { current: true },
      ),
    ).toBeNull();
  });

  it('does not accumulate active-file scroll callbacks as displayed files change', async () => {
    const user = userEvent.setup();
    renderDiffViewer(scrollSession);
    const pane = getDiffPane(files.first);
    stubActiveFileGeometry(pane, {
      first: 120,
      second: 240,
      last: 360,
    });
    const paneBounds = vi.spyOn(pane, 'getBoundingClientRect');
    const filter = screen.getByRole('textbox', { name: 'Filter changed files' });

    await user.type(filter, 'NewDiffPanel');
    await user.clear(filter);
    paneBounds.mockClear();
    fireEvent.scroll(pane);

    expect(paneBounds).toHaveBeenCalledOnce();
  });
});

describe('DiffViewer pending tree-target alignment', () => {
  beforeEach(() => {
    resizeObservers = new ControlledResizeObservers();
    intersectionObservers = installDiffViewerObservers(resizeObservers);
    animationFrames = installAnimationFrameHarness();
  });

  afterEach(() => {
    cleanup();
    intersectionObservers.reset();
    resizeObservers.reset();
    animationFrames.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts a smooth jump and realigns after an earlier file resizes', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    renderDiffViewer(scrollSession);
    const pane = getDiffPane(files.first);
    const firstSection = getFileSection(files.first);
    const targetSection = getFileSection(files.last);
    stubActiveFileGeometry(pane, {
      first: 100,
      second: 260,
      last: () => 500 - pane.scrollTop,
    });

    await user.click(treeFile(files.last));

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(treeFile(files.last)).toHaveAttribute('aria-current', 'true');
    expect(resizeObservers.activeObserverCount(firstSection)).toBe(1);
    expect(resizeObservers.activeObserverCount(targetSection)).toBe(1);

    act(() => {
      resizeObservers.notify(firstSection);
      resizeObservers.notify(firstSection);
      animationFrames.flushNext();
    });

    expect(pane.scrollTop).toBe(390);
  });

  it('keeps the target pending until relevant patch requests settle', async () => {
    vi.useFakeTimers();
    animationFrames = installAnimationFrameHarness();
    const patchRequest = deferred<DiffFilePatch>();
    vi.spyOn(api, 'getDiffFile').mockReturnValue(patchRequest.promise);
    renderDiffViewer(scrollSession);
    const pane = getDiffPane(files.first);
    const firstSection = getFileSection(files.first);
    const targetSection = getFileSection(files.last);
    stubActiveFileGeometry(pane, {
      first: 120,
      second: 300,
      last: 110,
    });

    act(() => intersectionObservers.notify(firstSection, true));
    fireEvent.click(treeFile(files.last));
    act(() => resizeObservers.notify(targetSection));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.scroll(pane);

    expect(treeFile(files.last)).toHaveAttribute('aria-current', 'true');
    expect(treeFile(files.first)).not.toHaveAttribute('aria-current');

    await act(async () => {
      patchRequest.resolve({ ...scenario.patches.textual, fileId: files.first.id });
      await patchRequest.promise;
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.scroll(pane);

    expect(treeFile(files.first)).toHaveAttribute('aria-current', 'true');
    expect(treeFile(files.last)).not.toHaveAttribute('aria-current');
  });

  it.each(['wheel', 'pointer', 'touch', 'navigation key'])(
    'cancels pending automatic alignment on %s input',
    async (eventName) => {
      const user = userEvent.setup();
      renderDiffViewer(scrollSession);
      const pane = getDiffPane(files.first);
      stubActiveFileGeometry(pane, {
        first: 120,
        second: 300,
        last: 420,
      });

      await user.click(treeFile(files.last));
      expect(treeFile(files.last)).toHaveAttribute('aria-current', 'true');

      cancelAutomaticAlignment(pane, eventName);
      fireEvent.scroll(pane);

      expect(treeFile(files.first)).toHaveAttribute('aria-current', 'true');
      expect(treeFile(files.last)).not.toHaveAttribute('aria-current');
    },
  );

  it('replaces an earlier pending target with a new tree selection', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    renderDiffViewer(scrollSession);
    const secondSection = getFileSection(files.second);
    const lastSection = getFileSection(files.last);

    await user.click(treeFile(files.second));
    expect(resizeObservers.activeObserverCount(secondSection)).toBe(1);

    await user.click(treeFile(files.last));

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(resizeObservers.disconnectedObserverCount(secondSection)).toBe(1);
    expect(resizeObservers.activeObserverCount(lastSection)).toBe(1);
    expect(treeFile(files.last)).toHaveAttribute('aria-current', 'true');
    expect(treeFile(files.second)).not.toHaveAttribute('aria-current');
  });

  it('ignores resize and loading work for files after the target', () => {
    vi.useFakeTimers();
    animationFrames = installAnimationFrameHarness();
    const unrelatedPatch = deferred<DiffFilePatch>();
    vi.spyOn(api, 'getDiffFile').mockReturnValue(unrelatedPatch.promise);
    renderDiffViewer(scrollSession);
    const pane = getDiffPane(files.first);
    const targetSection = getFileSection(files.second);
    const laterSection = getFileSection(files.last);
    let targetTop = 110;
    stubActiveFileGeometry(pane, {
      first: 120,
      second: () => targetTop,
      last: 400,
    });

    act(() => intersectionObservers.notify(laterSection, true));
    fireEvent.click(treeFile(files.second));

    expect(resizeObservers.activeObserverCount(laterSection)).toBe(0);
    act(() => {
      resizeObservers.notify(laterSection);
      resizeObservers.notify(targetSection);
      vi.advanceTimersByTime(700);
    });
    targetTop = 300;
    fireEvent.scroll(pane);

    expect(animationFrames.pendingCount()).toBe(0);
    expect(treeFile(files.first)).toHaveAttribute('aria-current', 'true');
    expect(treeFile(files.second)).not.toHaveAttribute('aria-current');
  });

  it('disconnects observers and cancels pending alignment work on unmount', () => {
    vi.useFakeTimers();
    animationFrames = installAnimationFrameHarness();
    const { unmount } = renderDiffViewer(scrollSession);
    const pane = getDiffPane(files.first);
    const targetSection = getFileSection(files.last);
    stubActiveFileGeometry(pane, {
      first: 120,
      second: 260,
      last: () => 500 - pane.scrollTop,
    });

    fireEvent.click(treeFile(files.last));
    act(() => {
      resizeObservers.notify(targetSection);
      resizeObservers.notify(targetSection);
    });
    expect(animationFrames.pendingCount()).toBe(1);

    unmount();

    expect(animationFrames.pendingCount()).toBe(0);
    expect(animationFrames.cancelledCount()).toBe(1);
    expect(resizeObservers.activeObserverCount()).toBe(0);
    expect(resizeObservers.disconnectedObserverCount()).toBe(1);
    expect(intersectionObservers.activeObserverCount(targetSection)).toBe(0);
    expect(intersectionObservers.disconnectedObserverCount(targetSection)).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes event handlers and settle timers before detached nodes receive events', () => {
    vi.useFakeTimers();
    animationFrames = installAnimationFrameHarness();
    const { unmount } = renderDiffViewer(scrollSession);
    const pane = getDiffPane(files.first);
    const targetSection = getFileSection(files.last);
    stubActiveFileGeometry(pane, {
      first: 120,
      second: 260,
      last: 110,
    });
    const paneBounds = vi.spyOn(pane, 'getBoundingClientRect');

    fireEvent.click(treeFile(files.last));
    act(() => resizeObservers.notify(targetSection));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    paneBounds.mockClear();

    fireEvent.scroll(pane);
    fireEvent(pane, new Event('scrollend'));
    fireEvent.wheel(pane);
    fireEvent.pointerDown(pane);
    fireEvent.touchStart(pane);
    fireEvent.keyDown(pane, { key: 'PageDown' });
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    fireEvent.pointerDown(document.body);
    fireEvent.resize(window);
    fireEvent.blur(window);
    act(() => {
      resizeObservers.notify(targetSection);
      vi.runAllTimers();
    });

    expect(paneBounds).not.toHaveBeenCalled();
    expect(animationFrames.pendingCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
