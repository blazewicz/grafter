# Work unit 6: Extract a repository-scoped service

You are implementing the sixth work unit of Grafter's repository-scoped windows migration.
This is the largest structural refactor before the behavior cutover. Complete it with the
current UI and IPC contract still working.

## Read first

Read and follow:

- `AGENTS.md`
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`
- the completed work units 1–5 and their handoff notes/tests

Inspect the current `AppService`, Git/GitHub services, approvals, persistence accessors,
runtime coordination, and session registry. Do not assume prior agents used names from the
plan. Preserve unrelated changes. Do not stage, commit, push, or open a pull request.

## Product context

The target window session owns live state for exactly one repository. The current service
still owns an array of project trees and finds worktrees by searching across them. That
global ownership must be decomposed before multiple repository windows are activated.

The current renderer and preload still expect `AppSnapshot.projects`. For this work unit,
the compatibility facade must continue satisfying them.

## Goal

Extract a repository-scoped service/runtime that owns exactly one repository's:

- persisted repository metadata and preferences;
- discovered worktrees and refresh lifecycle;
- pull-request hydration and caches;
- worktree and branch operations;
- status and details inspection;
- comparisons, commits, and diff sessions; and
- approvals and repository-context command access, as appropriate to existing security
  boundaries.

Retain a thin global `AppService` compatibility facade that composes multiple repository
services into the existing projects array and routes legacy calls to the correct service.

## Refactoring strategy

Keep the change reviewable by performing the extraction in two internal passes:

1. Move repository topology/live state, refresh, hydration, caches, and snapshot creation.
2. Move repository operations, details, diffs, approvals, and preference access.

Do not combine unrelated renderer redesign. If a single source file becomes a mechanical
copy of the old service, continue decomposing it into cohesive helpers rather than merely
renaming the monolith.

## Requirements

- A repository-scoped service must be constructed with one canonical repository identity
  and must never search another repository to resolve a worktree or request.
- Use process-wide coordination from work unit 4 for aggregate limits and mutation locks.
  Do not recreate shared limiters per repository service.
- Repository snapshots and background updates must be independently publishable to the
  owning consumer.
- A failure refreshing or hydrating one repository must not corrupt another repository's
  live state.
- Preserve targeted refresh behavior, pull-request freshness/deduplication, bounded
  hydration, comparison override semantics, diff-session limits, and approval binding.
- Keep persistence writes atomic through the store accessors introduced in work unit 2.
- The compatibility `AppService` may enumerate repository services for global refresh, but
  repository-local calls should route once and then remain scoped.
- Preserve project order in the legacy snapshot until the facade is removed.
- Clean up repository-owned caches, diff sessions, and background subscriptions when the
  service is disposed. Fire-and-forget promises must handle rejection.
- Do not weaken type validation at IPC or Git/GitHub parsing boundaries.

## Tests

Retain existing AppService coverage and add focused repository-service tests proving:

- a repository service returns only its own repository/worktrees;
- two services refresh and fail independently;
- worktree IDs from another repository are rejected rather than globally resolved;
- same-repository mutations across consumers use the shared lock;
- different repositories can perform safe work concurrently;
- global background limits remain global;
- pull-request caches and diff sessions do not leak across repositories;
- preference updates affect only the owning repository;
- disposal handles queued/background work safely; and
- the compatibility facade still preserves project order and current API behavior.

Avoid rewriting all tests around mocks that no longer exercise concurrency or persistence.
Move scenarios/factories only where ownership becomes clearer.

## Non-goals

- Do not enable multiple repository windows yet.
- Do not change launch or macOS activation behavior.
- Do not flatten the sidebar.
- Do not replace the projects array or narrow renderer IPC yet.
- Do not remove the compatibility AppService in this unit.

## Completion criteria

- All repository domain behavior is available through a one-repository service boundary.
- The global facade is orchestration/compatibility code, not the owner of repository live
  state.
- Current application behavior and contracts remain intact.
- `npm run check` passes.
- Summarize the scoped-service API, ownership/disposal rules, remaining facade duties, and
  any risks the window cutover must account for.
