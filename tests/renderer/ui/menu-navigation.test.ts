import { describe, expect, it } from 'vitest';
import { menuKeyAction, nextWrapIndex } from '../../../src/renderer/ui/menu-navigation';

describe('menuKeyAction', () => {
  it.each([
    ['ArrowDown', { kind: 'move', offset: 1 }],
    ['ArrowUp', { kind: 'move', offset: -1 }],
    ['Home', { kind: 'home' }],
    ['End', { kind: 'end' }],
    ['Enter', { kind: 'select' }],
    [' ', { kind: 'select' }],
    ['Escape', { kind: 'close' }],
  ] as const)('maps %s to the %s action', (key, expected) => {
    expect(menuKeyAction(key)).toEqual(expected);
  });

  it.each(['a', 'Tab', 'Shift', 'F5', ''] as const)(
    'ignores unrelated keys such as %s',
    (key) => {
      expect(menuKeyAction(key)).toBeUndefined();
    },
  );
});

describe('nextWrapIndex', () => {
  it('moves forward and wraps at the end', () => {
    expect(nextWrapIndex(0, 1, 3)).toBe(1);
    expect(nextWrapIndex(2, 1, 3)).toBe(0);
  });

  it('moves backward and wraps at the start', () => {
    expect(nextWrapIndex(1, -1, 3)).toBe(0);
    expect(nextWrapIndex(0, -1, 3)).toBe(2);
  });

  it('handles an unfocused current index of -1', () => {
    expect(nextWrapIndex(-1, 1, 3)).toBe(0);
    expect(nextWrapIndex(-1, -1, 3)).toBe(1);
  });

  it('stays at 0 for an empty list', () => {
    expect(nextWrapIndex(0, 1, 0)).toBe(0);
    expect(nextWrapIndex(3, -1, 0)).toBe(0);
  });
});
