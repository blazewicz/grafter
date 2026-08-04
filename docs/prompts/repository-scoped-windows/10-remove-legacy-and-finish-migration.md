# Work unit 10: Remove legacy state and finish the migration

You are implementing the final work unit of Grafter's repository-scoped windows migration.
Complete the cleanup so the runtime contains only the repository-scoped model while still
accepting pre-migration persisted state as input.

## Read first

Read and follow:

- `AGENTS.md`
- `.agents/skills/write-renderer-component-tests/SKILL.md` if renderer components or tests
  need modification
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`
- all completed work units 1–9 and their tests/handoff notes

Search the entire repository for legacy concepts before editing. Preserve unrelated
changes. Do not stage, commit, push, release, or open a pull request.

## Product context

Grafter now launches a welcome window, opens one canonical repository per window, focuses an
existing window rather than duplicating a repository, displays a flat worktree list, and
uses singular window-scoped contracts. Temporary compatibility code still supports the old
global project runtime and dual persisted representations.

The final code should retain migration support at the persisted-state input boundary, not
throughout services, IPC, preload, renderer, or tests.

## Goal

Remove the obsolete global-project implementation and finish documentation/terminology
updates without losing the ability to load a user's old state.

## Required cleanup

Locate and remove, when no longer required:

- the global `AppService` compatibility facade;
- multi-project refresh/orchestration code;
- project add/remove IPC and preload methods;
- zero/one-project snapshot adapters;
- legacy snapshot and request types;
- project expansion/removal renderer state and unused tree components;
- obsolete preview branches;
- dual-read/dual-write repository preference paths;
- legacy writes of the persisted `projects` field;
- factories, scenarios, and tests whose only purpose was impossible multi-project window
  state; and
- comments and names that falsely describe repositories as globally managed projects.

Do not remove domain identifiers or useful `Project`-named internals merely for churn. Rename
to repository terminology where the old name now misstates ownership or appears in the user
interface; otherwise prefer a focused follow-up over a repository-wide mechanical rename.

## Persisted-state compatibility

- Continue to accept the last supported pre-migration JSON shapes.
- Normalize old `projects`, setup overrides, and comparison overrides into recent repository
  records and repository preferences on load.
- After normalization, runtime state and future writes must use only the new schema.
- A successful new-format write may omit the legacy `projects` field, but only after tests
  prove equivalent recent/preference data is present in the same atomic transaction.
- Migration must remain idempotent and must not scan repository paths during application
  startup.
- Malformed or partially migrated input must degrade safely without broad casts.

## Product and documentation finish

- Update README descriptions and feature lists from managed global projects to opened
  repositories and repository-scoped windows.
- Document opening any worktree, recent repositories, one window per repository, and the
  non-goal of duplicate windows for a repository where user documentation benefits.
- Ensure all visible actions use **Open Repository...**, not **Add project** or **Remove from
  Grafter**.
- Check settings language for repository-specific setup overrides.
- Remove stale migration comments that no longer describe live compatibility behavior.

External OS entry points such as Finder `open-file`, second-instance command-line routing,
or a dedicated CLI remain separate follow-up work unless an entry point already exists and
is left broken by this cleanup. Do not expand this unit into packaging/installer integration.

## Verification

Search for obsolete API/channel/type/component names and classify every remaining match.
Add or update tests for:

- pristine new state;
- loading each supported legacy state shape and preserving recents/preferences;
- the first atomic write after legacy migration containing complete new data and no required
  legacy runtime state;
- repeated migration;
- welcome and repository startup using only the new model;
- no renderer/preload access to project CRUD or multi-project snapshots;
- one-window-per-canonical-repository behavior still holding; and
- all worktree, diff, audit, settings, approval, and recent-open flows affected by cleanup.

Run:

- `npm run check`
- `npm run package`, because main-process and compatibility cleanup can affect packaging

Exercise the packaged or development app with:

- a fresh state file;
- a representative legacy state file containing multiple projects and preferences;
- two different repositories in separate windows; and
- a linked worktree opened into its existing repository window.

Inspect runtime logs for unhandled rejections or late publications during window closure.

## Non-goals

- Do not support multiple windows for one repository.
- Do not restore previously open windows on launch.
- Do not build a cross-repository overview/search.
- Do not identify moved repositories by remote URL.
- Do not introduce unrelated features or broad domain renames.

## Completion criteria

- The application runtime, IPC, preload, renderer, and preview contain only the
  repository-scoped model.
- Legacy persisted state is supported only through normalization at load.
- Future state writes no longer maintain the legacy project registry.
- User documentation describes the new behavior accurately.
- `npm run check`, packaging, migration tests, and manual lifecycle checks pass.
- Provide a final migration summary including removed compatibility surfaces, supported
  legacy inputs, validation performed, and any genuinely separate follow-up work discovered.
