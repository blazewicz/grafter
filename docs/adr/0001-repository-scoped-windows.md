# ADR 0001: Scope each application window to one Git repository

- Status: Accepted
- Date: 2026-08-04

## Context

Grafter currently maintains a persistent list of projects and presents every project and
its worktrees in one application tree. This makes the application behave as a global
repository dashboard.

That model introduces several problems:

- The application must persist and eagerly restore the complete list of managed projects.
- The sidebar becomes increasingly large as users add projects and worktrees.
- Features such as worktree search either search every project or depend on an ambiguous
  notion of a current project.
- Repository failures and refresh work are part of one global application context.
- Opening more than one Grafter window does not provide independent repository contexts,
  because the main process currently owns one application service and broadcasts the same
  state to every window.

Grafter is primarily a tool for working with the worktrees of the repository that the user
is currently working on. An IDE-like open-folder model fits that purpose better than a
global project registry.

## Decision

Grafter will adopt a repository-scoped window model.

### Repository context

Each repository window represents exactly one Git repository and displays the worktrees of
that repository only. Repository-scoped features, including search, refresh, audit history,
diffs, branch operations, and worktree operations, operate within that window's repository
context.

The application will accept any worktree belonging to a repository as an entry point. It
will resolve the selected path to the canonical repository, discover all of its worktrees,
and initially select the worktree that the user opened. Users will not be required to find
or select the main worktree.

Repository identity will be based on a canonical Git repository location rather than the
particular worktree path used to open it. The precise persisted identity and path-migration
strategy will be designed as part of the implementation.

### Window behavior

Users may open separate Grafter windows for different repositories.

Opening a repository from a window that already has a repository open will create a new
repository window. Opening a repository from a welcome window will turn that same window
into the repository window instead of creating an additional window.

Grafter will allow at most one window per canonical repository. If the repository is already
open, Grafter will focus its existing window and select the worktree through which it was
opened. Supporting more than one window for the same canonical repository is an explicit
non-goal.

On application launch without a repository path, Grafter will show a welcome window rather
than automatically restoring the repositories that were open in the previous session.
When the application is activated with no remaining windows, it will also show a welcome
window.

### Welcome experience and recent repositories

The welcome window will provide a repository picker and a list of recently opened
repositories. Recent entries are navigation aids, not managed projects.

Rendering the welcome window must not inspect or refresh every recent repository. Entries
will be validated lazily when opened. Missing or unavailable entries may be marked or
removed without blocking application startup.

The user-facing action will be named **Open Repository...**. Closing a repository means
closing its window; repositories are no longer added to or removed from Grafter.

The renderer will have explicit loading, welcome, and repository states. The welcome
experience is distinct from the transient loading splash.

### Repository window interface

The repository's identity will be visible in the window chrome or sidebar header. The
sidebar tree will be replaced by a flat list of the current repository's worktrees, along
with repository-level actions such as creating a worktree.

Project-level details may remain available from the repository identity in the titlebar or
header. Cross-repository overview and search are not part of repository windows.

Git terminology will be preferred in new user-facing interfaces: a repository contains
worktrees. Existing internal `Project` names may be migrated separately where changing them
improves clarity.

### State and persistence

Application state will be divided by ownership:

- Global persistent state contains application settings and recent repositories.
- Repository-specific persistent state contains local preferences or overrides that must
  survive closing a window, such as setup-script overrides and comparison preferences.
- Discovered worktrees, pull request information, status, diffs, selection, and other live
  repository data are runtime state and are not restored by scanning recent repositories.

The repository snapshot exposed to a renderer will be singular rather than a collection of
projects. Repository identifiers may remain where they provide stable audit or persistence
identity, but renderer requests will not carry a project selector when the window context
already determines the repository.

The existing managed-project state will be treated as migration input for recent
repositories and repository-specific preferences. The migration must avoid silently losing
user configuration.

### Main-process isolation and coordination

Each repository window will have a main-process repository session. IPC requests will be
routed from the sending web contents to that session. Snapshot and command updates will be
sent only to the owning window instead of being broadcast indiscriminately to all windows.

Window isolation does not remove application-wide safety and concurrency requirements.
Subprocess capacity remains globally bounded, and mutating Git operations remain serialized
per canonical repository in the main process. Shared coordination must therefore live above
individual window sessions.

Closing a window will dispose of its subscriptions and window-owned runtime resources.
Unexpected background failures must remain observable while a session is alive.

## Consequences

### Positive

- The current repository is explicit and unambiguous throughout the interface.
- Sidebar size and search scope depend only on one repository's worktrees.
- Startup does not require refreshing every repository the user has previously opened.
- Refresh failures, live state, navigation, and command updates are isolated by window.
- Opening Grafter for a folder or worktree becomes a natural application entry point.
- The data model and IPC surface can express repository ownership more narrowly.

### Negative

- Multi-window session management and IPC routing are materially more complex than the
  current singleton service.
- Global concurrency and per-repository mutation locking must work across independent
  sessions.
- Existing contracts, persistence, renderer navigation, previews, and tests assume an array
  of projects and will require coordinated changes.
- Users lose the single-tree overview of all managed repositories.
- Repository moves and unavailable recent paths require an explicit persistence policy.

### Neutral or deferred

- A separate cross-repository overview could be introduced later without changing the
  repository-scoped window model.
- Restoring previously open repository windows on launch may be considered later.
- This record does not define the implementation work units or their delivery order.
