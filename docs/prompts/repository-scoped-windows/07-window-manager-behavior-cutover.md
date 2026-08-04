# Work unit 7: Introduce the window manager and perform the behavior cutover

You are implementing the seventh work unit of Grafter's repository-scoped windows
migration. This is the first intentional product-behavior cutover. Complete and validate the
working multi-window application; do not also perform the final sidebar or contract rewrite.

## Read first

Read and follow:

- `AGENTS.md`
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`
- the completed work units 1–6 and their tests/handoff notes

Inspect the actual repository/session/runtime interfaces before designing the window
manager. Preserve unrelated changes. Do not stage, commit, push, or open a pull request.

## Product behavior to implement

- Launching Grafter without an explicit repository opens a welcome window.
- Opening a repository from a welcome window turns that same window into the repository
  window.
- Opening a repository from an active repository window creates a new window.
- Opening any worktree resolves and opens its canonical repository, with that worktree
  initially selected.
- If the canonical repository already has a window, focus that window and select the
  requested worktree instead of creating a duplicate.
- Grafter allows at most one window per canonical repository. Duplicate windows for one
  repository are a non-goal.
- On macOS activation with no remaining windows, create a welcome window.
- Do not automatically restore previously open repository windows on launch.

## Goal

Add a main-process window manager that owns welcome and repository window sessions and
implements the behavior above using the sender-scoped IPC and repository service boundaries
from prior work.

For this cutover, repository sessions may adapt their singular repository state to the old
`AppSnapshot` contract with zero or one `projects` entry. Keep that compatibility adapter
explicit and documented. Do not combine this work with the singular contract migration.

## Requirements

### Window/session lifecycle

- The window manager must be the authority for creating, focusing, converting, and closing
  windows and for mapping canonical repository identities to live windows.
- Use an atomic in-flight open/deduplication mechanism so two simultaneous opens of the same
  repository cannot create duplicate windows.
- Register each window with the session registry from work unit 5 before renderer IPC can
  race startup.
- Construct a repository session with one repository-scoped service and the shared
  application runtime.
- Dispose session subscriptions, background publications, and registry entries exactly once
  when a window closes.
- Keep BrowserWindow security settings unchanged: sandboxing, context isolation, no Node
  integration, and HTTPS-only external links.

### Opening repositories

- Rename active user-facing actions to **Open Repository...**.
- Parent the folder chooser to the invoking window.
- Accept any worktree through the repository locator from work unit 1.
- Update recency only after a repository is resolved/opened successfully.
- Validate recent paths lazily. A failed recent open must leave the welcome window usable
  and display an actionable error.
- When focusing an existing repository window, publish a narrow selection/navigation event
  or state update for the requested worktree; do not forge a renderer click.
- An active repository window remains on its repository when it opens another repository in
  a new window.

### Welcome and menus

- Wire the welcome picker and recent entries prepared in work unit 3 to the window manager.
- Add or update the native application/File menu action for **Open Repository...** with a
  conventional macOS shortcut where appropriate.
- A welcome window can expose global settings if currently supported, but it must not create
  a repository service or scan recents.

### Compatibility boundary

- A repository window's compatibility snapshot contains exactly one project.
- A welcome window's compatibility snapshot contains no projects plus its recent metadata.
- Remove production reliance on the global multi-project AppService facade for live windows,
  but do not delete that facade until the cleanup work unit.
- Do not broadcast snapshots or command records across windows.

Command-line/Finder/second-instance path entry may remain deferred unless the existing app
already exposes such an entry point. Keep the window manager API capable of accepting a
path later without mixing OS integration into this cutover.

## Tests

Add deterministic main-process tests for:

- initial welcome creation;
- welcome-window reuse on successful open;
- new-window creation from an active repository window;
- simultaneous duplicate opens producing one repository window;
- an already open repository being focused;
- requested linked-worktree selection in a new and existing window;
- two different repositories receiving isolated snapshots and command events;
- lazy recent validation and failed-open recovery;
- close/disposal and late background updates;
- macOS activate behavior with zero and nonzero windows; and
- no automatic restoration at startup.

Use injectable BrowserWindow/dialog abstractions or focused helpers so lifecycle behavior is
testable without weakening production types.

## Required manual validation

- Run `npm run check`.
- Run `npm run package` because Electron lifecycle behavior changed.
- Exercise the packaged or development Electron app with two real test repositories and at
  least one linked worktree.
- Verify welcome reuse, second repository window creation, existing-window focus, selected
  linked worktree, independent refreshes, and clean closure without runtime errors.

## Non-goals

- Do not flatten the sidebar yet.
- Do not replace `AppSnapshot.projects` with the final singular contract.
- Do not remove all project IDs from IPC requests.
- Do not support two windows for the same repository.
- Do not restore windows from the previous launch.
- Do not add cross-repository search or overview.

## Completion criteria

- Repository-per-window behavior described in the ADR is live and usable.
- No repository window can observe or command another repository through its session.
- Duplicate canonical repository windows cannot be created, including under concurrent
  opens.
- The temporary zero/one-project compatibility adapter is clearly isolated for work unit 9.
- All automated and required manual/package validations pass.
- Summarize window-manager invariants, open/focus behavior, selection handoff, validation
  performed, and remaining compatibility surfaces.
