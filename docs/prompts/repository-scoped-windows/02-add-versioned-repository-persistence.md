# Work unit 2: Add versioned, non-destructive repository persistence

You are implementing the second work unit of Grafter's repository-scoped windows migration.
Complete the implementation in the repository; do not stop after proposing a schema.

## Read first

Read and follow:

- `AGENTS.md`
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`
- the completed work-unit 1 implementation and its tests

Inspect the actual repository state rather than assuming the previous agent used particular
class names. Preserve unrelated changes. Do not stage, commit, push, or open a pull request.

## Product context

The final application will persist global settings, recent repositories, and
repository-specific preferences. Discovered worktrees and other live repository data will
remain ephemeral. The current version still relies on a persisted `projects` array and must
keep working throughout this unit.

The migration must not silently lose setup-script overrides or comparison-base overrides.
It must also be safe to run repeatedly and must not inspect every recent repository during
startup.

## Goal

Evolve the existing atomic JSON state into a versioned, normalized format that additively
contains:

- recent repository records;
- last-opened ordering information and last known paths; and
- repository-specific preferences keyed by a stable persisted Grafter repository ID.

Keep the legacy project representation operational and synchronized during the
compatibility period.

## Data expectations

A recent repository record must contain enough information to render a welcome entry
without running Git and to reopen the last known repository/worktree path on demand. Keep a
generated Grafter repository ID stable when migrating an existing `ProjectConfig`.

Repository preferences must provide a home for:

- local setup-script overrides; and
- comparison-base overrides belonging to that repository's worktrees.

Do not use a remote URL as identity. Use the canonical repository information established
in work unit 1 for runtime deduplication, while retaining generated IDs for persisted
references and audit stability.

## Requirements

- Add an explicit schema version and normalization/migration functions for untrusted JSON.
- Loading a legacy state must derive new recent/preference records while retaining the
  legacy projects needed by the current app.
- Migration must be idempotent: loading already migrated state cannot duplicate recents or
  reset timestamps/preferences.
- Preserve the current serialized update transaction: clone, mutate, persist temporary
  file, rename, then publish in-memory state.
- During compatibility, current add/open/remove/update operations must maintain both models
  atomically. Under current semantics, removing a managed project should also remove its
  compatibility recent entry; closing a repository will acquire different semantics only
  after the later window cutover.
- Put setup and comparison preference access behind repository-scoped store methods or
  helpers. Temporary dual-read/dual-write behavior is acceptable and should be documented
  in code.
- Do not validate recent paths or invoke Git while loading the store.
- Normalize malformed arrays, records, dates, paths, IDs, preferences, and schema versions
  without broad casts or `any`.
- Inject time where needed so ordering tests are deterministic.
- Preserve unknown future safety as reasonably as the existing whole-file writer permits;
  do not design a database or add a dependency.

## Tests

Cover at least:

- pristine state;
- each legacy shape currently supported by tests;
- legacy projects becoming ordered recent records with stable IDs;
- setup-script and comparison override preservation;
- already migrated state loaded repeatedly;
- duplicate paths and IDs;
- malformed state at every new boundary;
- simultaneous updates and invocation order;
- failed persistence not publishing partial state;
- compatibility add, remove, and preference updates keeping both models aligned; and
- no Git/filesystem repository inspection during state load beyond reading the state file.

## Non-goals

- Do not render recent repositories yet.
- Do not stop using `projects` in the current application.
- Do not destructively delete legacy fields.
- Do not introduce multiple windows or sender-scoped IPC.
- Do not scan, repair, or remote-match missing repositories.

## Completion criteria

- Existing users retain their managed projects and all local preferences.
- New persisted repository data can support the later welcome window without Git queries.
- The visible application behavior remains unchanged.
- `npm run check` passes.
- Summarize the schema, migration/dual-write policy, and compatibility fields that a later
  cleanup must remove.
