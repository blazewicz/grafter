import { describe, expect, it } from 'vitest';
import { calculateDiffScrollCorrection } from '../../../../src/renderer/components/diff/diff-scroll';

const baseGeometry = {
  paneTop: 100,
  targetTop: 110,
  scrollTop: 500,
  scrollHeight: 2000,
  clientHeight: 500,
  scrollPaddingTop: 10,
};

describe('diff target scroll correction', () => {
  it('moves the target to the pane scroll padding', () => {
    expect(
      calculateDiffScrollCorrection({
        ...baseGeometry,
        targetTop: 610,
      }),
    ).toBe(500);
  });

  it('clamps correction at the start of the pane', () => {
    expect(
      calculateDiffScrollCorrection({
        ...baseGeometry,
        targetTop: -500,
      }),
    ).toBe(-500);
  });

  it('clamps correction when the target cannot reach the top near the end', () => {
    expect(
      calculateDiffScrollCorrection({
        ...baseGeometry,
        scrollTop: 1400,
        targetTop: 600,
      }),
    ).toBe(100);
  });

  it('returns no correction when the target is already aligned', () => {
    expect(calculateDiffScrollCorrection(baseGeometry)).toBe(0);
  });
});
