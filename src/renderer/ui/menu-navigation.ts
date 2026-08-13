export type MenuNavigationAction =
  | { kind: 'select' }
  | { kind: 'move'; offset: 1 | -1 }
  | { kind: 'home' }
  | { kind: 'end' }
  | { kind: 'close' };

/** Maps a KeyboardEvent key to an action; undefined = ignore. Space is ' '. */
export function menuKeyAction(key: string): MenuNavigationAction | undefined {
  switch (key) {
    case 'ArrowDown':
      return { kind: 'move', offset: 1 };
    case 'ArrowUp':
      return { kind: 'move', offset: -1 };
    case 'Home':
      return { kind: 'home' };
    case 'End':
      return { kind: 'end' };
    case 'Enter':
    case ' ':
      return { kind: 'select' };
    case 'Escape':
      return { kind: 'close' };
    default:
      return undefined;
  }
}

/** Wrap-around index math, safe for empty lists (count 0 -> 0, never NaN). */
export function nextWrapIndex(current: number, offset: number, count: number): number {
  if (count <= 0) return 0;
  return (((current + offset) % count) + count) % count;
}
