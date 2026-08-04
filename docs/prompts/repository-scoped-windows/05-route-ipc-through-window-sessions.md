# Work unit 5: Route IPC through window sessions

You are implementing the fifth work unit of Grafter's repository-scoped windows migration.
Complete sender-scoped IPC routing while retaining the current one-window product behavior.

## Read first

Read and follow:

- `AGENTS.md`
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`
- the completed work units 1–4

Inspect current main-process startup, preload, command routing, dialogs, and tests. Preserve
unrelated changes. Do not stage, commit, push, or open a pull request.

## Product context

Grafter currently has module-level window/service variables and broadcasts snapshots and
command updates to every BrowserWindow. The target architecture routes every request and
event through the session owning the sender's web contents. This unit establishes that
boundary without enabling multiple repository windows.

## Goal

Introduce a main-process window-session registry keyed by `webContents` identity. Route all
IPC handlers through the sending window's registered session, and target outgoing snapshot
and command updates to that session's window.

Initially, register the existing global `AppService` behind the only application window, so
the visible global-project behavior remains unchanged.

## Requirements

- Define a narrow session interface rather than giving handlers access to arbitrary window
  internals.
- Resolve a session from `IpcMainInvokeEvent.sender` for every session-owned IPC call.
- Reject unknown, destroyed, or disposed senders with controlled errors.
- Use the sender's owning BrowserWindow as the parent for dialogs. Remove reliance on a
  module-level `mainWindow!` assertion.
- Send snapshot updates only to the owning session.
- Connect the command subscription introduced in work unit 4 so command records are sent
  only to interested sessions. During this unit there may be only one.
- Dispose command/snapshot subscriptions and registry entries when a window closes or its
  web contents are destroyed.
- Guard against late background completion attempting to publish to a disposed window.
- Keep external URL validation, sandboxing, context isolation, clipboard validation, and
  narrow preload APIs unchanged.
- Register IPC handlers once; do not register a new global handler set per window.
- Keep lifecycle code ready for multiple sessions but do not create multiple repository
  windows yet.

## Tests

Add main-process tests with distinct fake/simulated sender identities proving:

- each sender resolves its own registered session;
- an invocation cannot use another session's service;
- snapshot and command events go only to the owning window;
- unknown and disposed senders are rejected;
- closing a window removes subscriptions and registry state;
- late updates after disposal are ignored safely and observably where appropriate;
- dialogs are parented to the invoking window; and
- existing URL, clipboard, and approval boundaries remain intact.

Prefer extracting testable routing/registry modules over trying to import a side-effectful
Electron entry point into unit tests.

## Non-goals

- Do not create welcome and repository session types yet unless a minimal type distinction
  is needed internally.
- Do not enable multiple BrowserWindows.
- Do not change startup behavior.
- Do not change the renderer/preload contract.
- Do not flatten the project tree or adopt singular snapshots.

## Completion criteria

- No IPC handler reaches a module-level application service without first resolving the
  sender's session.
- Snapshot and command updates are no longer indiscriminately broadcast.
- Current one-window behavior remains unchanged.
- `npm run check` passes.
- Summarize the session interface, registration/disposal lifecycle, and assumptions that
  the future window manager can rely upon.
