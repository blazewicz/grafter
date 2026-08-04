# Work unit 1: Resolve a repository from any worktree

You are implementing the first work unit of Grafter's repository-scoped windows migration.
Complete the implementation in the repository; do not stop after proposing a design.

## Read first

Read and follow:

- `AGENTS.md`
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`

Inspect the current implementation and tests before editing. Preserve unrelated working-tree
changes. Do not stage, commit, push, or open a pull request.

## Product context

Grafter currently persists multiple projects and requires users to add a repository's main
worktree. The accepted direction is one repository per application window. A user must be
able to open any linked worktree, have Grafter resolve the containing repository, discover
all its worktrees, and initially select the worktree they opened.

This first unit must remain compatible with the current global project tree. It establishes
repository resolution only; it does not introduce multiple windows or singular snapshots.

## Goal

Introduce a repository locator that accepts a directory in any worktree and resolves:

- the canonical Git common directory;
- the main worktree path;
- the selected worktree path;
- the repository display name; and
- any canonical identity value needed by later work, without inventing remote-based
  identity.

Make the existing add-project flow use the locator. Choosing a linked worktree should add
the same repository the main worktree would add. Keep the current project tree, snapshot,
and persistence behavior intact.

## Requirements

- Use `git` executable/argument arrays with `shell: false` through the existing command
  runner. Do not build shell command strings.
- Use Git plumbing that works when `.git` is a file, as it is in a linked worktree. Resolve
  filesystem paths canonically with real paths.
- Do not assume the selected worktree is the main worktree.
- Determine which listed worktree corresponds to the selected path and which is the main
  worktree.
- Continue to reject unsupported bare repositories with an actionable error unless the
  existing product already supports them.
- Deduplicate a repository added through different worktree paths.
- Keep command auditing and read-only command policy correct.
- Prefer a focused `RepositoryLocation`-style contract over expanding `ProjectConfig` with
  transient selection state. If a canonical path must be retained for later units, make its
  legacy-state behavior explicit and tested.
- Update user-facing picker text that incorrectly requires the main clone, but do not yet
  rename the entire project-oriented interface.

## Tests

Add deterministic tests for at least:

- selecting the main worktree;
- selecting a linked worktree;
- selecting the same repository through two different worktrees;
- a symlinked selected path;
- a directory that is not a Git worktree;
- a missing path;
- a bare repository; and
- malformed or incomplete `git worktree list --porcelain` output.

Test the locator independently where practical, and update AppService tests to prove the
current add-project flow stores one project rooted at the main worktree.

## Non-goals

- Do not add recent repositories or migrate persistence yet.
- Do not introduce a window manager, multiple windows, or window-scoped IPC.
- Do not change `AppSnapshot.projects` to a singular model.
- Do not flatten the sidebar.
- Do not add remote-URL identity or heuristics for moved repositories.

## Completion criteria

- The current application still presents the existing global project tree.
- Adding either the main or a linked worktree produces one canonical project with all of its
  worktrees.
- Existing project operations continue to work.
- `npm run check` passes.
- Summarize the chosen canonical identity, important edge-case behavior, tests run, and any
  migration concerns for the next agent.
