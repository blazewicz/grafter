import { describe, expect, it } from 'vitest';
import { calculateTooltipPosition } from '../../../../src/renderer/components/sidebar/SidebarTooltip';

describe('sidebar tooltip positioning', () => {
  it('places the tooltip below its label when it fits', () => {
    expect(
      calculateTooltipPosition({
        anchor: { bottom: 70, left: 120, top: 50 },
        tooltipHeight: 30,
        tooltipWidth: 180,
        viewportHeight: 400,
        viewportWidth: 600,
      }),
    ).toEqual({ left: 120, top: 74 });
  });

  it('keeps the tooltip inside the right edge of the viewport', () => {
    expect(
      calculateTooltipPosition({
        anchor: { bottom: 70, left: 270, top: 50 },
        tooltipHeight: 30,
        tooltipWidth: 180,
        viewportHeight: 400,
        viewportWidth: 320,
      }),
    ).toEqual({ left: 132, top: 74 });
  });

  it('flips the tooltip above its label near the bottom edge', () => {
    expect(
      calculateTooltipPosition({
        anchor: { bottom: 390, left: 120, top: 370 },
        tooltipHeight: 50,
        tooltipWidth: 180,
        viewportHeight: 400,
        viewportWidth: 600,
      }),
    ).toEqual({ left: 120, top: 316 });
  });
});
