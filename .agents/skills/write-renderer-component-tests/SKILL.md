---
name: write-renderer-component-tests
description: Write or improve Grafter renderer component tests with Testing Library, shared Fishery and faker factories, and reusable scenarios. Use for React components under src/renderer, tests under tests/renderer, renderer rendering or interaction changes, migrations from legacy renderer tests, or reviews of renderer test coverage.
---

# Write Renderer Component Tests

Use a nearby Testing Library test as the primary example. Preserve its intent—shared test data, accessible queries, user-level interactions, exact boundary assertions, and readable parameterization—without copying details that do not fit the component.

## Inspect Before Writing

Read:

1. The component and any feature-local hook or helper it uses.
2. Its shared contract types and calls through `grafter-api`.
3. Nearby tests for current conventions and reusable setup.
4. The parent view when ordering, conditional presence, or integration is relevant.

Read neighboring tests only to discover existing behavior and coverage. Treat tests based on `renderToStaticMarkup` or serialized HTML as legacy tests to migrate, not conventions to copy.

List the observable states and actions before selecting cases. Cover meaningful branches, not lines of implementation.

## Use Testing Library for Renderer Components

Use `@testing-library/react` for every renderer component test, including static rendering, conditional presence, composition, and ordering. Add `// @vitest-environment happy-dom` to the test file. Use `userEvent` for user interactions.

Do not use `renderToStaticMarkup`, serialized markup, or string containment assertions for renderer components. When updating a legacy component test, migrate the affected cases to Testing Library instead of extending the old harness.

Test exported pure helpers directly without rendering when their behavior is independent of React.

Name renderer component test files `<component-name>.test.tsx`. Keep tests under the matching renderer feature path.

## Reuse Factories and Scenarios

Inspect `tests/factories/` and `tests/scenarios/` before defining test data. Search by domain type, relationship, and behavior. Do not recreate an existing setup locally.

Use factories for individual domain objects:

- Keep factories in `tests/factories/`.
- Use Fishery for typed construction and `@faker-js/faker` for realistic defaults.
- Return a complete, valid, neutral object by default.
- Keep optional states absent unless they are part of the factory's core valid state.
- Compose existing lower-level factories instead of repeating nested object literals.
- Use generated IDs, names, paths, branches, hashes, titles, and other incidental values.

Use scenarios for relationships and meaningful test topology:

- Keep scenarios in `tests/scenarios/`, grouped by feature or behavior.
- Build related objects through factories and keep their IDs, ownership, membership, and derived state consistent.
- Return named objects that tests can use in rendering, mocks, actions, and assertions.
- Let scenarios own reusable states such as ordering, availability, pagination, and path topology.
- Author expected results independently. Never calculate an expected result with the production helper being tested.

Apply this reuse order:

1. Use an existing factory or scenario as-is.
2. Pass the smallest behavior-relevant override.
3. Amend the existing factory or scenario when the new state is broadly reusable.
4. Add a new factory or scenario only for a distinct domain responsibility or reusable behavior.

Do not create parallel factories or scenarios for the same concept. Avoid per-test factories, thin aliases, and large catch-all scenarios. Extend the file that already owns the concept and keep exports compact.

Tests should reference generated values rather than restating them. Feed the same generated value into mocks, user actions, and exact argument assertions. Keep literals only when they select the behavior under test or express the public output contract.

Do not pass an old complete fixture into a factory as overrides. If most fields need overriding, improve the factory or introduce a semantic scenario.

Use immutable overrides for a single case:

```tsx
renderComponent({ ...item, state: nextState });
```

Do not use `any`, broad casts, non-null assertions, or incomplete objects hidden behind assertions. Use `as const` and `satisfies` where they preserve shared-contract checking. Add focused scenario tests when relationships or independently authored expectations are non-trivial.

## Centralize Rendering

Create one small render helper that supplies stable defaults and exposes only inputs relevant to the tests:

```tsx
function renderComponent(
  nextItem: Item = scenario.item,
  status?: Status,
  onAction: (value: string) => void = () => undefined,
): void {
  render(
    <Component
      item={nextItem}
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
expect(action).toHaveBeenCalledWith(item.id, selectedValue);
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
  renderComponent({ ...item, value });
  expect(screen.getByText(expected)).toBeVisible();
});
```

Use tuple rows for compact enum-to-output mappings. Add `as const` or `satisfies` so TypeScript checks literal values. Keep different behaviors in separate tests even when they use the same table.

Do not parameterize unrelated scenarios merely to reduce line count. A table should express one invariant.

## Cover the Right Boundaries

For a typical interactive component, consider:

- representative display transformations, including unchanged fallback;
- each meaningful status or availability state;
- every user action and its exact callback or API arguments;
- menus, dialogs, and selection persistence;
- rejected asynchronous actions reaching the shared error callback;
- accessibility names and state attributes;
- cleanup-sensitive effects such as document listeners or timers, when behavior makes them observable.

Test at the component boundary first. Add a parent-view test only for composition, ordering, or conditional inclusion that the component cannot prove itself.

## Verify

Run the focused test while iterating:

```sh
npm test -- tests/renderer/<path>/<component-name>.test.tsx
```

Then run:

```sh
npm run check
```

If production renderer behavior changed as well as tests, exercise the affected flow in the Vite in-app preview and check for runtime errors.
