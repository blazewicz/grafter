# Plan: Consolidate menu keyboard navigation into a pure helper

## Context

Four components implement list/menu keyboard navigation independently:

| Component          | Pattern                                        | Keys handled                                       |
| ------------------ | ---------------------------------------------- | -------------------------------------------------- |
| `ToolPicker`       | state-driven (`activeIndex`) + roving tabindex | ArrowDown/Up, Home, End, Enter, Space, Escape, Tab |
| `ContextMenu`      | stateless, DOM queries                         | ArrowDown/Up, Home, End, Escape                    |
| `WorktreeSortMenu` | stateless, DOM queries                         | ArrowDown/Up, Home, End, Escape                    |
| `BranchPicker`     | value-driven (`activeBranch`), combobox        | ArrowDown/Up, Enter (no Home/End)                  |

All reimplement the same wrap-around index math and key-to-action mapping,
and have already drifted apart (e.g. `% options.length` can produce `NaN` on an
empty list in `ToolPicker`; key coverage differs everywhere).

## Decision

Extract a small **pure** helper module — no hooks. Each component keeps its own
state and focus policy (ToolPicker's roving tabindex, ContextMenu's DOM queries,
BranchPicker's value-based active item and combobox focus model) but delegates
the key-to-action mapping and index math to shared functions.

`BranchPicker` additionally gains Home/End support as part of the migration.

## Helper module

New file: `src/renderer/ui/menu-navigation.ts` (kebab-case, matching
`floating-position.ts`).

```ts
export type MenuNavigationAction =
  | { kind: 'select' }
  | { kind: 'move'; offset: 1 | -1 }
  | { kind: 'home' }
  | { kind: 'end' }
  | { kind: 'close' };

/** Maps a KeyboardEvent key to an action; undefined = ignore. Space is ' '. */
export function menuKeyAction(key: string): MenuNavigationAction | undefined;

/** Wrap-around index math, safe for empty lists (count 0 -> 0, never NaN). */
export function nextWrapIndex(current: number, offset: number, count: number): number;
```

Scope decisions:

- `Tab` stays per-component (only ToolPicker closes on Tab; context menus and
  the combobox must not).
- `close` only maps from Escape. Whether close restores focus (ToolPicker,
  WorktreeSortMenu) or not (ContextMenu) remains component policy.
- BranchPicker's disabled-item skipping stays in BranchPicker (`available` list
  already excludes disabled items before navigation math runs).

## Migration steps

1. **Add helper** `src/renderer/ui/menu-navigation.ts` with unit tests in
   `tests/renderer/ui/menu-navigation.test.ts`: key mapping table, wrap-around at
   both ends, Home/End, empty-list safety.
2. **ToolPicker**: replace the `handleMenuKeyDown` branches with
   `menuKeyAction(event.key)`; replace `(index + 1) % options.length` and
   `(index - 1 + options.length) % options.length` with `nextWrapIndex`.
   Behavior unchanged.
3. **ContextMenu / WorktreeSortMenu**: replace the inline ternary/modulo index
   computation with `nextWrapIndex`; replace the key allow-list with
   `menuKeyAction`. Behavior unchanged.
4. **BranchPicker**: replace `moveActive` internals with `nextWrapIndex` and add
   Home/End via `menuKeyAction` (Home -> `available[0]`, End -> last). Extend
   `tests/renderer/branches/branch-picker.test.tsx` with Home/End cases.
5. Run `npm run check`.

## Out of scope

- New hooks (`useMenuNavigation` etc.) — revisit only if a third stateful menu
  with focus-on-open appears.
- Merging the three state models (state vs DOM vs value).
- Making BranchPicker a menu (it stays a combobox: Enter-only select, no
  Space, no focus management).
- Touch/pointer hover behavior (already per-component via `onPointerMove`).

## Acceptance criteria

- All four components consume the helper; no inline modulo/key branches remain.
- BranchPicker supports Home/End.
- Behavior of existing key handling is unchanged (test suites pass as-is,
  plus new Home/End and helper tests).
- `npm run check` green.
