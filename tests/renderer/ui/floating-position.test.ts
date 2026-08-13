import { describe, expect, it } from 'vitest';
import { computeFloatingRect } from '../../../src/renderer/ui/floating-position';

const viewport = { width: 800, height: 600 };

describe('computeFloatingRect', () => {
  it('places the floating element below the anchor with a gap for bottom-start', () => {
    expect(
      computeFloatingRect(
        { left: 100, top: 100, width: 60, height: 24 },
        { left: 0, top: 0, width: 200, height: 40 },
        viewport,
        { placement: 'bottom-start', gap: 5, viewportMargin: 8 },
      ),
    ).toEqual({ left: 100, top: 129 });
  });

  it('aligns the right edge with the anchor for bottom-end', () => {
    expect(
      computeFloatingRect(
        { left: 300, top: 100, width: 60, height: 24 },
        { left: 0, top: 0, width: 200, height: 40 },
        viewport,
        { placement: 'bottom-end', gap: 5, viewportMargin: 8 },
      ),
    ).toEqual({ left: 160, top: 129 });
  });

  it('clamps the left edge when overflowing the right edge', () => {
    expect(
      computeFloatingRect(
        { left: 780, top: 100, width: 60, height: 24 },
        { left: 0, top: 0, width: 200, height: 40 },
        viewport,
        { placement: 'bottom-start', gap: 5, viewportMargin: 8 },
      ),
    ).toEqual({ left: 592, top: 129 });
  });

  it('clamps the left edge when overflowing the left edge', () => {
    expect(
      computeFloatingRect(
        { left: 0, top: 100, width: 60, height: 24 },
        { left: 0, top: 0, width: 200, height: 40 },
        viewport,
        { placement: 'bottom-start', gap: 5, viewportMargin: 8 },
      ),
    ).toEqual({ left: 8, top: 129 });
  });

  it('flips above the anchor when there is no room below', () => {
    expect(
      computeFloatingRect(
        { left: 100, top: 580, width: 60, height: 24 },
        { left: 0, top: 0, width: 200, height: 40 },
        viewport,
        { placement: 'bottom-start', gap: 5, viewportMargin: 8 },
      ),
    ).toEqual({ left: 100, top: 535 });
  });

  it('keeps the configured gap in both directions', () => {
    const options = { placement: 'bottom-start' as const, gap: 9, viewportMargin: 8 };
    const below = computeFloatingRect(
      { left: 100, top: 100, width: 60, height: 24 },
      { left: 0, top: 0, width: 200, height: 40 },
      viewport,
      options,
    );
    const above = computeFloatingRect(
      { left: 100, top: 580, width: 60, height: 24 },
      { left: 0, top: 0, width: 200, height: 40 },
      viewport,
      options,
    );

    expect(below.top).toBe(100 + 24 + 9);
    expect(above.top).toBe(580 - 9 - 40);
  });

  it('pins a floating element taller than the viewport inside it', () => {
    expect(
      computeFloatingRect(
        { left: 100, top: 100, width: 60, height: 24 },
        { left: 0, top: 0, width: 200, height: 700 },
        viewport,
        { placement: 'bottom-start', gap: 5, viewportMargin: 8 },
      ),
    ).toEqual({ left: 100, top: 8 });
  });

  it('pins a floating element wider than the viewport inside it', () => {
    expect(
      computeFloatingRect(
        { left: 0, top: 100, width: 60, height: 24 },
        { left: 0, top: 0, width: 900, height: 40 },
        viewport,
        { placement: 'bottom-start', gap: 5, viewportMargin: 8 },
      ),
    ).toEqual({ left: 8, top: 129 });
  });
});
