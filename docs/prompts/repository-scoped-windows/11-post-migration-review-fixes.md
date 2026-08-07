# Resolve post-migration review findings

Implement the four issues below. Read and follow `AGENTS.md`, inspect the current code before
editing, preserve unrelated changes, and do not stage, commit, push, or open a pull request.

## 1. Apply the shared repository-refresh limit

The process-wide repository-refresh limiter exists, but production refresh calls bypass it.
With several open windows, periodic refreshes can consume aggregate command capacity.

### Acceptance criteria

- Automatic repository refreshes across windows use the shared refresh limiter.
- Interactive command capacity remains available while many repositories refresh.
- Different repositories may still refresh concurrently within the configured limit.
- Same-repository mutation serialization remains correct.
- Deterministic tests prove the production refresh path uses the shared limit and releases
  capacity after failures.

## 2. Propagate global settings changes

Updating settings currently refreshes only the invoking window. Other repository windows
and welcome windows can retain stale global settings.

### Acceptance criteria

- A successful settings update publishes a fresh snapshot to every live window session.
- Repository windows retain their own repository state while receiving the new settings.
- Welcome windows receive the new settings without inspecting repositories.
- Disposed windows receive no updates.
- Tests cover propagation across at least two repository sessions and one welcome session.

## 3. Surface native menu open failures

Failures from the native **Open Repository...** menu action are currently written only to
the console.

### Acceptance criteria

- Selecting an invalid, missing, or unsupported repository through the native menu presents
  actionable user-visible feedback.
- The invoking window remains usable and its session is unchanged.
- Cancellation does not show an error.
- Errors remain logged for diagnostics.
- The behavior is covered through an extracted, testable main-process boundary.

## 4. Restore RepositoryService orchestration coverage

Port the important behavior-level coverage lost when the old AppService suite was removed.

### Acceptance criteria

Add deterministic RepositoryService tests for:

- successful worktree creation, including exactly one post-mutation topology refresh and
  recalculated display names;
- approved worktree removal, serialized with mutations and consumed once;
- setup approval execution without an unnecessary topology refresh;
- branch switching clearing stale pull-request data and starting a refresh for the new
  branch;
- comparison override persistence and reuse when opening a diff;
- editor access bound to a worktree checked out on the source branch; and
- repository mutation-lock release after command failure.

Test observable commands, state, persistence, approvals, and concurrency rather than private
implementation details. Reuse existing factories, scenarios, and test helpers.

## Verification

- Run focused tests while implementing.
- Run `npm run check` before completion.
- Report the production behavior changed, tests added, and validation results.
