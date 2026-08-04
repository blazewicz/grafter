# Repository-scoped windows migration plan

- Status: Draft
- Related decision: [ADR 0001](adr/0001-repository-scoped-windows.md)

## Purpose

Migrate Grafter from one global, persistent project tree to one repository per application
window without requiring a single large cutover change.

This plan describes reviewable delivery boundaries. It does not prescribe exact class or
file names, and it should be revised as implementation work exposes better seams.

## Delivery principles

- Keep Grafter usable and releasable after every work unit.
- Change one architectural axis at a time: resolution, persistence, process coordination,
  window routing, service scope, contracts, or interface.
- Establish new behavior beside the current behavior before switching the application to
  it.
- Prefer short-lived adapters and additive persisted fields to a long-lived feature flag.
- Preserve the legacy `projects` data until the new state has been exercised through at
  least the cutover. Do not make the first state migration destructive.
- Give compatibility code an explicit removal unit so that the temporary dual model does
  not become permanent.
- Split a work unit again if it cannot make one independently testable claim or grows beyond
  a comfortable review size.

## Target concepts

The migration introduces four concepts with different lifetimes:

- A **repository locator** resolves any selected worktree to its canonical Git repository,
  main worktree, and initially selected worktree.
- The **application store** owns global settings, recent repositories, and persisted
  repository preferences.
- The **application runtime** owns process-wide command limits, background-work limits,
  repository mutation locks, and command event routing.
- A **window session** owns either the welcome state or the runtime state for one repository
  window.

The canonical runtime key should be the real path of Git's common directory. A persisted
repository record should retain its generated Grafter identifier and last known paths. We
should not attempt to identify a moved repository by its remote URL because remotes are
neither required nor unique.

## Proposed work units

### 1. Resolve a repository from any worktree

Introduce a tested repository locator that accepts a directory in any worktree and returns:

- the canonical Git common directory;
- the main worktree path;
- the selected worktree path; and
- the repository display name.

Make the current **Add project** flow use the locator while retaining the existing project
tree and persistence. Selecting a linked worktree becomes a backward-compatible
enhancement: the current application still adds the repository represented by its main
worktree.

The locator should use executable/argument arrays, `shell: false`, real paths, and Git
plumbing rather than assumptions about `.git` being a directory. Cover main worktrees,
linked worktrees, symlinks, invalid repositories, bare repositories, and disappeared paths.

**Application after merge:** the current single-window project tree works as before, but
users may select any worktree when adding a project.

### 2. Add versioned, non-destructive repository persistence

Evolve the JSON state through normalization rather than replacing it. Add:

- a schema version;
- recent repository records with last-opened timestamps and paths; and
- repository-specific preference records keyed by the persisted repository identifier.

On first load, derive recent records and repository preferences from legacy projects while
leaving `projects` intact. During the compatibility period, adding, opening, removing, and
updating a project must keep the legacy and new representations consistent. A failure to
persist either representation must not publish a partially updated in-memory state.

Move setup-script overrides and comparison-base overrides behind repository-scoped store
accessors. Initially, those accessors may dual-read and dual-write the legacy fields.

Test old state, malformed state, repeated migration, duplicate paths, ordering, concurrent
updates, and persistence failures. Missing recent paths must not be checked during store
load.

**Application after merge:** the visible behavior is unchanged, and the saved state is safe
for both the current project tree and the future welcome window.

### 3. Prepare the renderer without changing its repository model

Make two behavior-preserving renderer extractions:

1. Extract the worktree rows and new-worktree flow from `ProjectNode` into a component that
   can later render as a flat repository worktree list.
2. Separate transient application loading from the empty/welcome experience.

Expose recent repository metadata additively in the existing snapshot and let the empty
state display it. Opening a recent entry may still feed the current add-project flow at this
stage. Existing populated project trees must render exactly as before.

Keep renderer tests focused on the extracted components and exercise the empty state in the
live preview.

**Application after merge:** the current interface is intact, while the flat list and
welcome experience have reusable, tested seams.

### 4. Extract process-wide runtime coordination

Move coordination that must survive multiple services out of `AppService` and into one
application runtime created by the main process. This includes:

- the aggregate command runner;
- the shared background subprocess limit;
- the shared repository-refresh limit;
- mutation serialization keyed by canonical repository identity; and
- routing of command-record updates to interested sessions.

`AppService` should consume the shared runtime, but continue to expose the current global
project behavior. Add deterministic tests proving that two consumers cannot bypass the
same-repository mutation lock or the global background limit, and that locks are released
after success and failure.

**Application after merge:** behavior is unchanged, but creating more than one repository
service later cannot accidentally multiply limits or mutation capacity.

### 5. Route IPC through window sessions

Introduce a main-process session registry keyed by the sender's `webContents`. Route every
IPC call through the sending window's session instead of a module-level service variable.
Send snapshot and command updates to the owning session rather than broadcasting them to
every window.

Initially register the existing global `AppService` as the only window session. Do not
enable multiple repository windows yet. Reject calls from unknown or disposed web contents,
and dispose subscriptions when a window closes.

Test sender isolation, targeted events, unknown senders, session disposal, and late
background updates. This unit should not change the preload API or visible application
behavior.

**Application after merge:** Grafter still opens one global-project window, but its IPC and
event paths already enforce window ownership.

### 6. Extract a repository-scoped service

Refactor the current service in two passes if necessary:

1. Extract repository topology and live state: project metadata, worktrees, refresh,
   pull-request hydration, and per-repository caches.
2. Move repository operations and inspection onto the scoped service: branch and worktree
   operations, status, details, diffs, approvals, and repository preferences.

Keep the existing `AppService` as a compatibility facade that composes repository services
into the current `projects` array. This lets existing renderer and IPC contracts continue
to work while repository isolation is tested below them.

Test two repository services concurrently, including independent snapshots and failures,
shared global capacity, cross-service command routing, and serialized mutations. A scoped
service must never locate a worktree by searching another repository's state.

**Application after merge:** the current UI remains multi-project, but the domain behavior
is implemented by repository-scoped services suitable for window ownership.

### 7. Introduce the window manager and perform the behavior cutover

Add a main-process window manager responsible for:

- creating welcome and repository sessions;
- turning a welcome window into a repository window;
- opening a new window when **Open Repository...** is invoked from a repository window;
- focusing the existing window when the canonical repository is already open;
- selecting the worktree through which an existing repository was reopened; and
- creating a welcome window on launch and on macOS activation when no windows remain.

For this cutover only, a repository session may adapt its singular state to the existing
`AppSnapshot` shape with zero or one `projects` entry. This deliberately limits the cutover
to Electron lifecycle and session behavior. It must not also contain the final contract and
sidebar rewrite.

Wire the welcome picker and recent entries to the window manager. Recent entries are
validated only when opened. Failure leaves the welcome window usable and displays the
error. Add or update the application menu action for **Open Repository...**.

Test concurrent attempts to open the same repository, welcome-window reuse, new-window
creation, focus/deduplication, selected-worktree handoff, close/disposal, and failed opens.
Exercise the flows in packaged Electron as well as automated main-process tests.

**Application after merge:** the repository-per-window product behavior is live. The
repository window temporarily retains the old project wrapper in its data and sidebar.

### 8. Flatten the repository window interface

Switch repository windows to the prepared flat worktree list. Show repository identity and
repository-level actions in the titlebar or sidebar header. Remove project expansion and
**Remove from Grafter** from repository windows. Make **Open Repository...** the only
repository-opening action in an active window.

Keep repository details reachable, preserve worktree navigation history, and initially
select the worktree supplied by the window session. Search and other repository-wide
features must consume only the current repository's worktrees.

Test the complete renderer flow and exercise it in the live preview or Electron with more
worktrees than fit vertically.

**Application after merge:** the target interface is visible, although a compatibility
snapshot adapter and some project-oriented API names still exist internally.

### 9. Adopt singular contracts and narrow the IPC API

Replace the compatibility `projects` array with a discriminated window snapshot:

- loading;
- welcome, containing recent repositories; or
- repository, containing exactly one repository and its worktrees.

Migrate `App`, preview data, factories, scenarios, preload types, and IPC payloads to the
singular model. Remove repository/project identifiers from requests where the sender's
window session already supplies that authority. Retain identifiers in audit records and
persisted state where they provide stable identity.

This may be divided by API family while both contracts exist briefly—for example topology
and worktree creation first, then details and diffs, then settings and audit—but each family
must be migrated end-to-end across shared contracts, main handler, preload, renderer,
preview, and tests.

**Application after merge:** process boundaries express the final repository ownership;
cross-repository requests cannot be constructed through the renderer API.

### 10. Remove legacy state and compatibility code

Remove the global `AppService` facade, legacy project CRUD IPC, tree components that no
longer have consumers, dual-read/dual-write persistence, and obsolete factories and
scenarios. Stop writing the legacy `projects` field.

Whether to remove old persisted fields immediately or leave them ignored for one release
should be decided when this unit is scheduled. Reading an old pre-migration state must
remain supported and must still populate recent repositories and repository preferences.

Update the README and user-facing terminology from managed projects to opened repositories.
Add supported external entry points, such as a repository path supplied at launch, in one or
more separate changes after the core window flow is stable.

**Application after merge:** only the repository-scoped model remains in application code;
backward compatibility exists at the persisted-state input boundary rather than throughout
the runtime.

## Validation gates

Every work unit must run `npm run check`. In addition:

- Persistence changes require tests for migration, atomicity, malformed input, and repeated
  load/update cycles.
- Runtime and service changes require deterministic concurrency, ordering, failure, and
  cleanup tests.
- IPC changes require tests that use distinct sender identities and prove that updates do
  not leak between sessions.
- Renderer changes require Testing Library coverage and a live preview or Electron check
  for the affected flow.
- Electron lifecycle changes require an unpacked platform package build and manual checks
  with at least two repositories and a linked worktree.

The behavior cutover should not merge until the following end-to-end scenarios pass:

1. Launch with no path, open a main worktree, and receive one repository window.
2. Launch with no path, open a linked worktree, and see that worktree selected among all
   repository worktrees.
3. Open another repository from an active repository window and receive a second window.
4. Open an already open repository and focus its existing window without creating a
   duplicate.
5. Close all windows, reactivate Grafter, and receive a welcome window.
6. Open a missing recent repository, remain on the welcome window, and recover by opening a
   valid repository.
7. Run independent read-only operations in two repositories while same-repository mutations
   remain serialized.

## Explicitly deferred

- Breaking the work units into issue-level implementation checklists.
- Restoring previously open repository windows on application launch.
- A cross-repository overview or cross-repository search.
- Multiple windows for one canonical repository, which remains a non-goal.
- Automatically matching a moved repository by its Git remote.
