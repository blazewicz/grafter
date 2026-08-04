# Work unit 9: Adopt singular window contracts and narrow IPC

You are implementing the ninth work unit of Grafter's repository-scoped windows migration.
Complete the end-to-end process-boundary migration from the temporary zero/one-project
adapter to honest window-scoped contracts.

## Read first

Read and follow:

- `AGENTS.md`
- `.agents/skills/write-renderer-component-tests/SKILL.md` in full
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`
- the completed work units 1–8

The renderer-test skill is mandatory because renderer contracts, components, factories, and
tests will change. Inspect every IPC family across shared contract, channel, main handler,
preload, renderer use, preview implementation, and tests before editing. Preserve unrelated
changes. Do not stage, commit, push, or open a pull request.

## Product context

The product already behaves as one repository per window and renders a flat worktree list.
Internally, repository sessions still adapt state to `AppSnapshot.projects` with zero or one
entry, and many renderer requests still carry a `projectId` that the window already
determines. Those contracts preserve obsolete cross-repository authority and must now be
removed.

## Goal

Introduce a discriminated, window-scoped snapshot model and narrow repository IPC so the
sending window supplies repository authority.

The snapshot must represent:

- transient loading;
- welcome state with recent repositories and required global settings; and
- repository state with exactly one repository and its worktrees.

Remove the compatibility projects-array adapter from production code.

## Contract requirements

- Use a discriminant that forces exhaustive handling without broad casts or non-null
  assertions.
- Keep serializable global fields only in the states that need them, or define a small shared
  base where that reduces repetition without weakening state distinctions.
- Repository state contains one repository value, never an array.
- Welcome state contains recent metadata but no live repository/worktree state.
- Loading is distinct from welcome; do not infer loading from missing data.
- Preserve stable repository/worktree IDs in audit records, persistence, selection, and
  keys where they remain useful.

## IPC narrowing

Remove repository/project selectors from calls whose repository is already determined by
the sender's session. This includes, as applicable in the current code:

- refresh/list branches/suggest worktree path;
- worktree creation;
- repository setup preference updates;
- branch/commit diff requests; and
- command/audit queries whose repository scope can be injected safely.

Worktree IDs, diff session IDs, commit hashes, branches, and paths may remain where they
select a resource within the owning repository. Every service method must validate that a
resource belongs to its repository session; a renderer-provided ID must never escape the
session boundary.

Retain repository IDs in command contexts and persisted records where they provide audit or
identity value. The objective is removal of caller-selected repository authority, not the
elimination of identifiers everywhere.

## Migration strategy

Migrate each API family end to end before moving to the next. A short-lived adapter may
exist during implementation, but no old/new parallel production contract should remain at
completion. Suggested families are:

1. snapshot, refresh, branches, and worktree topology;
2. worktree details, status, switching, creation, removal, and opening;
3. comparisons, commits, and diffs;
4. repository preferences, approvals, command logs, and audit updates.

Keep IPC payloads explicit and narrow. Do not expose a general command runner, filesystem
access, or arbitrary path opener to the renderer.

## Renderer and preview requirements

- Update `App` to switch exhaustively over window state while keeping feature-local state in
  owning components.
- Reconcile selection/history only against the active repository snapshot.
- Reset repository-owned renderer state when a welcome/repository session transition
  changes identity.
- Keep subscriptions cleaned up across window-state transitions and unmount.
- Update preload typings and development preview behavior together with each API family.
- Update shared factories/scenarios to produce welcome and repository snapshots directly;
  remove routine construction of impossible multi-project renderer states.

## Tests

Add/update tests proving:

- exhaustive loading, welcome, and repository rendering;
- repository snapshots cannot represent zero or multiple repositories;
- repository state transitions reset/reconcile selection safely;
- narrowed preload calls send no project selector;
- handlers derive repository authority from the sender's session;
- foreign worktree/session IDs are rejected;
- two windows cannot query or mutate each other's repository through crafted payloads;
- preview behavior matches production contracts; and
- existing approval, audit, diff, and worktree flows remain functional.

Use factories and reusable scenarios rather than local fixture objects. Preserve meaningful
main-process concurrency and security-boundary tests.

## Required validation

- Run `npm run check`.
- Exercise loading, welcome, repository open, worktree selection, creation/removal, details,
  audit, and diff flows in the live preview or Electron as appropriate.
- Check for runtime/console errors after switching window state.

## Non-goals

- Do not remove backward reading of old persisted state yet.
- Do not add duplicate repository windows.
- Do not restore prior windows on launch.
- Do not implement cross-repository features.
- Do not perform unrelated terminology renames deep in Git/domain code.

## Completion criteria

- No production renderer or preload contract exposes `AppSnapshot.projects`.
- Window state is an explicit loading/welcome/repository union.
- Repository-scoped IPC cannot select an arbitrary project/repository.
- Shared contracts, main, preload, renderer, preview, factories, scenarios, and tests are
  aligned.
- `npm run check` and runtime validation pass.
- Summarize the final snapshot union, narrowed IPC families, retained identifiers and why,
  and all compatibility code left for work unit 10.
