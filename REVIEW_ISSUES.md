# Architecture Review Issues

## [P1] Make the custom title bar work correctly on Linux

Grafter unconditionally configures the Electron window with `titleBarStyle: 'hiddenInset'`,
which is a macOS-specific title bar style. The renderer-provided title bar does not include
close, minimize, or maximize controls, and the window does not enable Window Controls
Overlay for Linux. Verify the packaged application on supported Linux desktop environments
and introduce platform-specific window configuration so Linux users always have functional
native or application-provided window controls.

## [P1] Make approval failures and expiration recoverable

Approval tokens are consumed before an approved command runs. If the command fails to
start, exits unsuccessfully, its post-success check fails, or the token has expired, the
renderer keeps showing the approval dialog while the token can no longer be approved or
rejected. Model approval outcomes explicitly and ensure every terminal outcome closes or
replaces the dialog with a recoverable error state. Add coverage for rejection, expiration,
spawn failure, non-zero exit, and post-success failure.

## [P1] Serialize and harden persistent state updates

`StateStore.update()` mutates live in-memory state before persistence and uses the same
temporary filename for every write. Concurrent updates can race during the temporary-file
rename; a direct concurrent-update probe reproduced an `ENOENT` failure. Serialize writes,
write cloned candidate state through unique temporary files, and replace in-memory state
only after persistence succeeds. Also prevent concurrent app instances from writing the
same state file, or introduce an appropriate cross-process locking strategy.

## [P1] Validate all IPC payloads and authorize IPC senders

Most IPC handlers rely on compile-time TypeScript types even though renderer input is
untrusted at runtime. Add shared runtime validation for identifiers, settings,
worktree-creation requests, editor values, scripts, command approvals, and URLs. Validate
that each IPC request originates from Grafter's expected window and frame before performing
filesystem access, process execution, persistence, or external navigation. Keep validation
schemas close to the shared contracts so the main process, preload bridge, and renderer
remain aligned.

## [P1] Add CSP, navigation restrictions, and a permission policy

The renderer document has no Content Security Policy, the window does not prevent
unexpected top-level navigation, and no explicit Electron permission handler is installed.
Add a restrictive production CSP, deny navigation away from the packaged renderer or
approved development origin, continue denying new windows, and reject permissions that
Grafter does not require. Treat this as defense in depth for the privileged preload bridge.

## [P1] Bound and batch command output

Each stdout or stderr chunk is appended to a command record and causes the entire growing
record to be cloned and broadcast to the renderer. Chatty setup scripts can therefore
produce quadratic IPC traffic, unbounded memory growth, and excessive React updates.
Introduce incremental or batched output events, throttle renderer updates, impose explicit
per-command output limits with visible truncation markers, and retain enough output for the
audit model without allowing it to exhaust application resources.

## [P1] Add command cancellation and timeout policies

Git, GitHub CLI, and setup-script processes currently have no cancellation or timeout
behavior. A hung `gh` request can leave worktree inspection loading indefinitely, while an
approved setup script can run forever with no way to stop it. Add operation-specific
policies: bounded timeouts for routine Git and GitHub reads, user cancellation for
long-running operations, and deliberate process-tree cleanup. Record cancellation and
timeout outcomes in the audit log.

## [P1] Preserve successful worktree creation when setup discovery fails

Worktree creation mutates the repository before Grafter reads `.grafter.json` and prepares
the optional setup approval. If configuration parsing or worktree rediscovery fails after
the Git command succeeds, the API reports the entire operation as failed and the renderer
does not apply the updated snapshot. Retrying may then fail because the worktree already
exists. Represent creation and post-creation setup discovery as separate outcomes so a
successfully created worktree remains visible even when setup discovery produces a warning.

## [P1] Read repository setup configuration from the created branch

Repository-provided setup configuration is currently read from the project's main clone
rather than from the newly created worktree. A branch that adds or changes `.grafter.json`
therefore receives setup behavior from whichever branch is checked out in the main clone.
Read repository configuration from the created worktree while preserving the documented
precedence of local per-project overrides.

## [P2] Refresh selected worktree details with the project snapshot

The Refresh action updates the project/worktree snapshot, but worktree details are fetched
only when the selected worktree ID changes. Pull request data, comparison target, diff
statistics, and head information can remain stale after a manual refresh. Give the details
resource an explicit invalidation signal or revision and refetch it as part of the refresh
flow without introducing duplicate overlapping requests.

## [P2] Distinguish unavailable data from valid empty states

Project refresh failures are converted into projects with zero worktrees. GitHub CLI
absence, authentication errors, network failures, malformed output, and a genuine
"no pull request" result are all displayed as "No pull request found." Introduce explicit
result states for success, not found, unavailable, and failed so the interface does not
misrepresent operational errors as valid empty data. Keep the underlying failed command
visible in the audit log.

## [P2] Show a recoverable UI when application initialization fails

Persistent-state loading and sequential repository refresh happen before the main window is
created. Corrupt state or an initialization exception can prevent Grafter from showing any
window. Create a window early enough to display loading and recovery states, validate and
migrate persisted data, and provide a safe recovery path for malformed state rather than
requiring users to locate and delete application files manually.

## [P2] Disable implicit preview fallback in packaged builds

The renderer silently uses the preview API whenever the preload bridge is absent. A
packaged build with a broken preload can consequently display sample projects and accept
fake operations instead of exposing a fatal integration error. Enable preview behavior only
through an explicit development/browser-preview flag and fail clearly when the bridge is
missing in an Electron build.

## [P2] Derive approval and audit policy from semantic command types

`isReadOnly` and `requiresApproval` are caller-provided booleans on a general command
specification. Current call sites are mostly correct, but the architecture allows a future
destructive Git operation to be mislabeled or executed without approval. Define semantic
operation kinds or a centralized command-policy layer that derives mutability, approval,
and audit behavior. Keep the raw command runner internal and incapable of silently
bypassing destructive-operation policy.

## [P2] Replace hand-built dialogs and menus with accessible primitives

Live preview inspection confirmed that opening Settings leaves focus on a background
title-bar button and that Escape does not close the modal. Dialogs do not trap or restore
focus, while the project and editor menus lack complete keyboard navigation and focus
management. Adopt well-tested, style-neutral primitives such as Radix Dialog and Dropdown
Menu, preserve Grafter's existing visual design, and cover focus, Escape, Tab, arrow-key,
and screen-reader behavior.

## [P2] Make renderer operation state safe under concurrency

The renderer uses one global `busy` boolean for unrelated asynchronous operations. If two
operations overlap, the first completion can clear the busy state while the second is still
running, and out-of-order snapshots can overwrite newer UI state. Use operation-local
pending states or a counted operation coordinator, prevent conflicting mutations, and
define how stale responses are discarded.

## [P2] Add tests around application services and security-sensitive workflows

The existing tests cover parsers, command-log presentation, paths, editors, and a small
part of Git integration, but there is no direct coverage for `ApprovalManager`,
`AppService`, IPC validation, command failure lifecycle, or most worktree creation and
removal behavior. Add focused tests for approval expiration and failure, main/locked
worktree protection, exact-command binding, post-mutation failures, command spawn errors,
output limits, cancellation, and invalid IPC payloads.

## [P2] Add renderer and packaged Electron smoke tests

There are no automated renderer component tests or packaged-app smoke tests. Add React
Testing Library and user-event coverage for dialogs, worktree creation, refresh
invalidation, command updates, and error recovery, plus automated accessibility checks
where practical. Add small packaged smoke runs on macOS and Linux that verify preload
availability, initial rendering, window controls, and absence of runtime errors.

## [P3] Split the global stylesheet by feature ownership

The renderer uses a single stylesheet of roughly 1,400 lines and more than 200 global class
selectors. The visual system is cohesive, but continued feature growth will make ownership,
unused-style cleanup, and class collision prevention increasingly difficult. Retain one
global tokens/base file and move shell, sidebar, details, audit, and dialog styles alongside
their feature areas. CSS Modules are optional; clear feature ownership is the primary goal.

## [P3] Make the development preview behaviorally representative

The preview API satisfies the shared TypeScript interface but does not accurately simulate
worktree creation, approval state transitions, rejection, command updates, or common
failure states. Split fixture data from preview behavior and make important workflows
stateful enough that renderer changes can be exercised without Electron. Avoid non-null
assertions in fixtures so preview code follows the same type-safety conventions as
production code.

## [P3] Align dependency, runtime, and release maintenance

Production dependencies currently have no reported audit vulnerabilities, but the Electron
Forge build tree includes unresolved advisories through old transitive `tar` and `tmp`
versions. Track upstream fixes and validate packaging before applying transitive overrides.
Align `@types/node` with the supported development runtime and Electron's embedded Node
version, remove `--legacy-peer-deps` from CI if a clean install succeeds, add dependency
automation, and include the `LICENSE` file declared by `package.json`.
