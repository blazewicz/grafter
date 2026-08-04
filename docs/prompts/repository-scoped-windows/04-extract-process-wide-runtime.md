# Work unit 4: Extract process-wide runtime coordination

You are implementing the fourth work unit of Grafter's repository-scoped windows migration.
Complete the refactor and its tests; do not introduce multiple windows yet.

## Read first

Read and follow:

- `AGENTS.md`
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`
- the completed work units 1–3

Inspect the actual implementation because prior agents may have chosen different names.
Preserve unrelated changes. Do not stage, commit, push, or open a pull request.

## Product context

The final app can have repository windows for different repositories, but only one window
per canonical repository. Window-specific services must not multiply global subprocess or
background limits, and no two consumers may bypass the mutation lock for the same canonical
repository.

The current `AppService` owns several limiters, caches, and per-project locks. The main
process owns one `CommandRunner`, whose aggregate command limit is already process-wide.
This unit moves all coordination that must remain global into an explicit application
runtime while preserving current visible behavior.

## Goal

Create a process-wide runtime/coordinator, constructed once by the Electron main process and
injected into services, that owns:

- the aggregate command runner;
- the shared background subprocess limit;
- the shared repository-refresh limit;
- mutation serialization keyed by canonical repository identity; and
- the foundation for routing command-record updates to interested sessions.

Keep the global project tree, current service facade, IPC API, and single-window behavior.

## Requirements

- Use the canonical repository identity established by work unit 1 for mutation locks. Do
  not key cross-service safety only by a transient window ID or a caller-provided renderer
  value.
- Preserve independent concurrency for different repositories.
- Use shared `p-limit` instances when the cap must apply across calls/services.
- Keep background capacity below aggregate subprocess capacity so interactive work retains
  room.
- Ensure every queued operation settles once and every lock/limiter remains usable after
  success, command failure, thrown callbacks, and cancellation/closure paths supported by
  the current code.
- Do not silently truncate parser input or weaken existing output/update bounds.
- Retain observable background errors and handled rejections.
- Avoid a service-locator singleton. Construct the runtime in main and inject narrow
  dependencies so tests can create isolated runtimes.
- Command event routing may initially have one subscriber representing the current app, but
  the API must allow later session-specific subscriptions and unsubscription.
- Keep approvals bound to their exact prepared commands.

## Tests

Add deterministic tests proving:

- two consumers for the same canonical repository serialize mutations;
- different repositories may mutate independently within aggregate limits;
- limits are shared across multiple service consumers;
- background work cannot consume reserved interactive capacity;
- queue order is deterministic where promised;
- failures release repository locks and limiter capacity;
- command-event subscribers receive the expected updates and can unsubscribe; and
- rejected fire-and-forget work remains observable.

Update existing AppService and command tests rather than replacing strong coverage with
implementation-specific assertions.

## Non-goals

- Do not add a window manager or create a second BrowserWindow.
- Do not route IPC by sender yet.
- Do not extract the full repository service yet.
- Do not change renderer contracts or visible behavior.
- Do not allow duplicate windows for one repository.

## Completion criteria

- There is one explicit process-wide runtime in application startup.
- Existing service behavior uses its shared coordination rather than private copies where
  cross-session correctness will matter.
- The current application remains functionally unchanged.
- `npm run check` passes.
- Summarize runtime ownership, lock keys, limit values, event-subscription behavior, and any
  remaining service-local state that work unit 6 must address.
