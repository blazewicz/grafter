import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { DiffFileSummary } from '../../shared/contracts';
import { calculateDiffScrollCorrection } from './diff-scroll';

export function useDiffNavigation(
  orderedFiles: readonly DiffFileSummary[],
  loading: ReadonlySet<string>,
): {
  diffPaneRef: RefObject<HTMLDivElement | null>;
  displayedActiveFileId: string | undefined;
  clearPendingTarget: () => void;
  selectFile: (fileId: string) => void;
} {
  const diffPaneRef = useRef<HTMLDivElement>(null);
  const [activeFileId, setActiveFileId] = useState<string>();
  const [pendingTargetId, setPendingTargetId] = useState<string>();
  const loadingFiles = useRef(loading);
  const displayedActiveFileId =
    pendingTargetId && orderedFiles.some((file) => file.id === pendingTargetId)
      ? pendingTargetId
      : activeFileId && orderedFiles.some((file) => file.id === activeFileId)
        ? activeFileId
        : orderedFiles[0]?.id;

  useEffect(() => {
    loadingFiles.current = loading;
  }, [loading]);

  useEffect(() => {
    const pane = diffPaneRef.current;
    if (!pane) return;

    const updateActiveFile = (): void => {
      const paneTop = pane.getBoundingClientRect().top;
      const files = pane.querySelectorAll<HTMLElement>('[data-diff-file-id]');
      let closestId = files[0]?.dataset.diffFileId;
      for (const file of files) {
        if (file.getBoundingClientRect().top > paneTop + 70) break;
        closestId = file.dataset.diffFileId;
      }
      if (closestId) setActiveFileId(closestId);
    };

    pane.addEventListener('scroll', updateActiveFile, { passive: true });
    return () => pane.removeEventListener('scroll', updateActiveFile);
  }, [orderedFiles]);

  useEffect(() => {
    if (!pendingTargetId) return;
    const pane = diffPaneRef.current;
    const targetIndex = orderedFiles.findIndex((file) => file.id === pendingTargetId);
    const target = document.getElementById(diffFileElementId(pendingTargetId));
    if (!pane || !target || targetIndex === -1) return;

    const relevantFileIds = new Set(
      orderedFiles.slice(0, targetIndex + 1).map((file) => file.id),
    );
    let active = true;
    let alignmentFrame: number | undefined;
    let settleTimer: number | undefined;
    let quietChecks = 0;
    let initialResizeDelivered = false;

    const clearScheduledWork = (): void => {
      if (alignmentFrame !== undefined) window.cancelAnimationFrame(alignmentFrame);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    };

    const finishWhenSettled = (): void => {
      if (!active) return;
      const relevantFileLoading = [...loadingFiles.current].some((fileId) =>
        relevantFileIds.has(fileId),
      );
      const correction = diffScrollCorrection(pane, target);
      if (Math.abs(correction) > 1) {
        quietChecks = 0;
        pane.scrollTop += correction;
      } else if (!relevantFileLoading) {
        quietChecks += 1;
        if (quietChecks >= 2) {
          setActiveFileId(pendingTargetId);
          setPendingTargetId((current) =>
            current === pendingTargetId ? undefined : current,
          );
          return;
        }
      } else {
        quietChecks = 0;
      }
      settleTimer = window.setTimeout(finishWhenSettled, 150);
    };

    const scheduleAlignment = (): void => {
      quietChecks = 0;
      if (alignmentFrame !== undefined) window.cancelAnimationFrame(alignmentFrame);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      alignmentFrame = window.requestAnimationFrame(() => {
        alignmentFrame = undefined;
        if (!active) return;
        const correction = diffScrollCorrection(pane, target);
        if (Math.abs(correction) > 1) pane.scrollTop += correction;
        settleTimer = window.setTimeout(finishWhenSettled, 300);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      if (!initialResizeDelivered) {
        initialResizeDelivered = true;
        settleTimer = window.setTimeout(finishWhenSettled, 400);
        return;
      }
      scheduleAlignment();
    });
    for (const file of pane.querySelectorAll<HTMLElement>('[data-diff-file-id]')) {
      if (!relevantFileIds.has(file.dataset.diffFileId ?? '')) continue;
      resizeObserver.observe(file);
    }

    const cancelPendingTarget = (): void => {
      setPendingTargetId((current) =>
        current === pendingTargetId ? undefined : current,
      );
    };
    const cancelOnNavigationKey = (event: KeyboardEvent): void => {
      if (
        ['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '].includes(
          event.key,
        )
      ) {
        cancelPendingTarget();
      }
    };

    pane.addEventListener('scrollend', scheduleAlignment);
    pane.addEventListener('wheel', cancelPendingTarget, { passive: true });
    pane.addEventListener('pointerdown', cancelPendingTarget, { passive: true });
    pane.addEventListener('touchstart', cancelPendingTarget, { passive: true });
    pane.addEventListener('keydown', cancelOnNavigationKey);
    return () => {
      active = false;
      clearScheduledWork();
      resizeObserver.disconnect();
      pane.removeEventListener('scrollend', scheduleAlignment);
      pane.removeEventListener('wheel', cancelPendingTarget);
      pane.removeEventListener('pointerdown', cancelPendingTarget);
      pane.removeEventListener('touchstart', cancelPendingTarget);
      pane.removeEventListener('keydown', cancelOnNavigationKey);
    };
  }, [orderedFiles, pendingTargetId]);

  const clearPendingTarget = (): void => setPendingTargetId(undefined);

  const selectFile = (fileId: string): void => {
    setActiveFileId(fileId);
    setPendingTargetId(fileId);
    document
      .getElementById(diffFileElementId(fileId))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return {
    diffPaneRef,
    displayedActiveFileId,
    clearPendingTarget,
    selectFile,
  };
}

export function diffFileElementId(fileId: string): string {
  return `diff-viewer-${fileId}`;
}

function diffScrollCorrection(pane: HTMLElement, target: HTMLElement): number {
  const paneBounds = pane.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const scrollPaddingTop =
    Number.parseFloat(getComputedStyle(pane).scrollPaddingTop) || 0;
  return calculateDiffScrollCorrection({
    paneTop: paneBounds.top,
    targetTop: targetBounds.top,
    scrollTop: pane.scrollTop,
    scrollHeight: pane.scrollHeight,
    clientHeight: pane.clientHeight,
    scrollPaddingTop,
  });
}
