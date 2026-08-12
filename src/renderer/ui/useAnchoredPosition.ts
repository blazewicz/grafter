import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { computeFloatingRect } from './floating-position';
import type { FloatingPlacement } from './floating-position';

export interface UseAnchoredPositionOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  floatingRef: RefObject<HTMLElement | null>;
  placement: FloatingPlacement;
  gap?: number;
  viewportMargin?: number;
  offsetX?: number;
  recomputeKey?: unknown;
}

export function useAnchoredPosition({
  open,
  anchorRef,
  floatingRef,
  placement,
  gap = 5,
  viewportMargin = 8,
  offsetX = 0,
  recomputeKey,
}: UseAnchoredPositionOptions): { left: number; top: number } | undefined {
  const [measured, setMeasured] = useState<{ left: number; top: number }>();

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = (): void => {
      const anchor = anchorRef.current;
      const floating = floatingRef.current;
      if (!anchor || !floating) return;
      const anchorRect = anchor.getBoundingClientRect();
      const next = computeFloatingRect(
        {
          left: anchorRect.left + offsetX,
          top: anchorRect.top,
          width: anchorRect.width,
          height: anchorRect.height,
        },
        floating.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        { placement, gap, viewportMargin },
      );
      setMeasured(next);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [
    anchorRef,
    floatingRef,
    gap,
    offsetX,
    open,
    placement,
    recomputeKey,
    viewportMargin,
  ]);

  return open ? measured : undefined;
}
