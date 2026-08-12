export type FloatingPlacement = 'bottom-start' | 'bottom-end';

export interface FloatingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ComputeFloatingRectOptions {
  placement: FloatingPlacement;
  gap: number;
  viewportMargin: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

export function computeFloatingRect(
  anchor: FloatingRect,
  floating: FloatingRect,
  viewport: { width: number; height: number },
  options: ComputeFloatingRectOptions,
): { left: number; top: number } {
  const { placement, gap, viewportMargin } = options;
  const left =
    placement === 'bottom-end'
      ? anchor.left + anchor.width - floating.width
      : anchor.left;
  const clampedLeft = clamp(
    left,
    viewportMargin,
    viewport.width - floating.width - viewportMargin,
  );
  const belowTop = anchor.top + anchor.height + gap;
  const aboveTop = anchor.top - gap - floating.height;
  const fitsBelow = belowTop + floating.height <= viewport.height - viewportMargin;
  const fitsAbove = aboveTop >= viewportMargin;
  const top = fitsBelow || !fitsAbove ? belowTop : aboveTop;
  const clampedTop = clamp(
    top,
    viewportMargin,
    viewport.height - floating.height - viewportMargin,
  );
  return { left: clampedLeft, top: clampedTop };
}
