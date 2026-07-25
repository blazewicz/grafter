---
name: write-worktree-details-card-tests
description: Write or improve Grafter renderer tests for React cards and card-like controls in the worktree details view. Use for components under src/renderer/components/details, tests under tests/renderer/components/details, changes to a details card's rendering or interactions, or reviews of test coverage for worktree details UI behavior.
---

# Write Worktree Details Card Tests

Use `tests/renderer/components/details/path-card.test.tsx` as the primary example. Preserve its intent—typed fixtures, accessible queries, user-level interactions, exact boundary assertions, and readable parameterization—without copying details that do not fit the component.

## Inspect Before Writing

Read:

1. The card component and any feature-local hook or helper it uses.
2. Its shared contract types and calls through `grafter-api`.
3. The primary example.
4. The parent details view when card ordering, conditional presence, or integration is relevant.

Read neighboring tests only to discover existing behavior and coverage. Treat tests based on `renderToStaticMarkup` or serialized HTML as legacy tests to migrate, not conventions to copy.

List the observable states and actions before selecting cases. Cover meaningful branches, not lines of implementation.

## Use Testing Library for Renderer Components

Use `@testing-library/react` for every renderer component test, including static rendering, conditional presence, composition, and ordering. Add `// @vitest-environment happy-dom` to the test file. Use `userEvent` for user interactions.

Do not use `renderToStaticMarkup`, serialized markup, or string containment assertions for renderer components. When updating a legacy card test, migrate the affected cases to Testing Library instead of extending the old harness.

Test exported pure helpers directly without rendering when their behavior is independent of React.

Name renderer component test files `<card-name>.test.tsx`. Keep tests beside the matching feature path under `tests/renderer/components/details/`.

## Build Typed Test Data

Create a small, valid, explicitly typed baseline fixture from shared contracts. Include only data needed to make the card realistic.

When repository relationships matter, model them: for example, provide a main worktree and the worktree under test instead of an impossible isolated object.

Use immutable overrides:

```tsx
renderCard({ ...worktree, path: nextPath });
```

Do not use `any`, broad casts, or incomplete objects hidden behind assertions. Use `as const` for literal cases and `satisfies` when a parameter table should be checked against a shared union or contract.

## Centralize Rendering

Create one small render helper that supplies stable defaults and exposes only inputs relevant to the tests:

```tsx
function renderCard(
  nextWorktree: Worktree = worktree,
  status?: WorktreeStatus,
  onAction: (value: string) => void = () => undefined,
): void {
  render(
    <Card
      worktree={nextWorktree}
      status={status}
      onAction={onAction}
      onError={() => undefined}
    />,
  );
}
```

Keep the helper declarative. Do not hide user interactions or assertions inside it. Pass spies through callback props and spy on the shared `api` object for preload-bound actions.

Clean isolation explicitly:

```tsx
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
```

Create `userEvent.setup()` inside each interactive test.

## Assert Public Behavior

Prefer queries in this order:

1. `getByRole` with the exact accessible name for controls and landmarks.
2. Visible text when text is the user-facing contract.
3. Semantic attributes such as `aria-expanded`, `aria-disabled`, `aria-haspopup`, or a purposeful title.
4. A narrow selector only when semantics cannot distinguish the intended element, such as displayed text specifically inside `code`.

Before clicking a control, assert that it is visible with the intended accessible name. Then perform the action and assert the result.

For callbacks and API calls, assert both cardinality and exact arguments:

```tsx
expect(action).toHaveBeenCalledOnce();
expect(action).toHaveBeenCalledWith(worktree.id, selectedValue);
```

For stateful controls, assert the state transition as well as the side effect. A picker test should verify its trigger, expanded state, menu semantics, selected action, exact API call, and resulting current selection when applicable.

Assert disabled, unavailable, loading, failure, and empty states when the component exposes them. Include negative assertions when absence is part of the contract.

Avoid implementation-detail assertions against hook state, private helpers, CSS module names, icon-library classes, raw HTML, or incidental DOM structure. Assert icons through an accessible name or other user-observable contract when the icon conveys meaning. Do not add snapshots for behavior that can be stated directly.

## Parameterize Behavior Matrices

Use `it.each` when one rule has several inputs or enum states. Give every failing row a useful generated name.

Use object rows when fields need names:

```tsx
it.each([
  { value: firstInput, expected: firstLabel },
  { value: secondInput, expected: secondLabel },
])('shows $value as $expected', ({ value, expected }) => {
  renderCard({ ...worktree, value });
  expect(screen.getByText(expected)).toBeVisible();
});
```

Use tuple rows for compact enum-to-output mappings. Add `as const` or `satisfies` so TypeScript checks literal values. Keep different behaviors in separate tests even when they use the same table.

Do not parameterize unrelated scenarios merely to reduce line count. A table should express one invariant.

## Cover the Right Boundaries

For a typical interactive card, consider:

- representative display transformations, including unchanged fallback;
- each meaningful status or availability state;
- every user action and its exact callback or API arguments;
- menus, dialogs, and selection persistence;
- rejected asynchronous actions reaching the shared error callback;
- accessibility names and state attributes;
- cleanup-sensitive effects such as document listeners or timers, when behavior makes them observable.

Test at the card boundary first. Add a parent-view test only for composition, ordering, or conditional inclusion that the card cannot prove itself.

## Verify

Run the focused test while iterating:

```sh
npm test -- tests/renderer/components/details/<card-name>.test.tsx
```

Then run:

```sh
npm run check
```

If production renderer behavior changed as well as tests, exercise the affected flow in the Vite in-app preview and check for runtime errors.
