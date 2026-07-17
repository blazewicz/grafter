import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../src/main/concurrency';

describe('mapWithConcurrency', () => {
  it('preserves result order while bounding active work', async () => {
    let active = 0;
    let maximumActive = 0;

    const results = await mapWithConcurrency(
      Array.from({ length: 13 }, (_, index) => index),
      5,
      async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return value * 2;
      },
    );

    expect(maximumActive).toBe(5);
    expect(results).toEqual(Array.from({ length: 13 }, (_, index) => index * 2));
  });

  it('rejects invalid limits', async () => {
    await expect(
      mapWithConcurrency([], 0, () => Promise.resolve(undefined)),
    ).rejects.toThrow('Concurrency limit must be a positive integer.');
  });
});
