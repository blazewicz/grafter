# Work unit 8: Flatten the repository window interface

You are implementing the eighth work unit of Grafter's repository-scoped windows migration.
Complete the target repository-window interface while retaining the temporary zero/one
project snapshot adapter for one more unit.

## Read first

Read and follow:

- `AGENTS.md`
- `.agents/skills/write-renderer-component-tests/SKILL.md` in full
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`
- the completed work units 1–7

The renderer-test skill is mandatory. Inspect the running behavior and current component
seams rather than assuming names from the original plan. Reuse the existing visual system,
icons, factories, and scenarios. Preserve unrelated changes. Do not stage, commit, push, or
open a pull request.

## Product context

Repository-per-window behavior is now active, but a repository window temporarily adapts
its singular service state to `AppSnapshot.projects[0]` and may still display the old
project-tree wrapper. The target UI shows repository identity once and a flat list of that
repository's worktrees.

## Goal

Replace the repository window's nested project tree with a compact flat worktree list using
the renderer seams prepared in work unit 3. Keep welcome behavior and repository-window
isolation intact.

## Requirements

### Sidebar and titlebar

- Show the repository name clearly in the window chrome or sidebar header.
- Render a flat, sorted list of current repository worktrees with no expand/collapse project
  node.
- Preserve the distinction and accessible labeling of the main worktree, linked worktrees,
  checked-out branches, paths, pull-request information currently shown, and selected state.
- Retain hover-revealed secondary actions and the existing compact visual language.
- Provide a clear repository-level new-worktree action and preserve the inline creation
  flow, suggested paths, approval behavior, cancellation, and error reporting.
- Remove **Remove from Grafter** from repository windows. Closing a repository is closing its
  window; it is not a sidebar mutation.
- Expose **Open Repository...** from an active repository window through the appropriate
  existing titlebar/menu action without adding a repository to that window.

### Navigation and scoping

- Keep repository details reachable from the repository identity.
- Preserve back/forward navigation and reconcile it against only the current repository and
  its worktrees.
- Honor the worktree-selection handoff from the window manager when a linked worktree is
  opened or an existing repository window is focused.
- Ensure refresh, search if present, audit context, settings, diffs, and worktree operations
  consume only the current repository's data.
- Remove renderer state for project expansion and project removal where it is no longer
  used by repository windows.
- Keep the temporary snapshot adapter localized; do not spread new `projects[0]` assertions
  through leaf components.

### Welcome state

- Do not regress the distinct loading and welcome states.
- Recent repository actions continue to use the window manager and lazy validation.
- A failed open remains recoverable in the welcome window.

## Tests

Use Testing Library, user-event, shared factories, and scenarios. Cover at least:

- a repository sidebar with main and linked worktrees in deterministic order;
- selection and worktree-selection handoff;
- repository details navigation and back/forward behavior;
- new-worktree open, cancel, success, and setup approval;
- linked-worktree removal while the main worktree has no remove action;
- repository identity and **Open Repository...** behavior;
- absence of project expansion and **Remove from Grafter**;
- accessible names and keyboard behavior; and
- no data/actions from a second repository appearing in the window.

Update preview data and component scenarios rather than embedding ad hoc fixtures.

## Required live validation

- Run `npm run check`.
- Start the renderer with the Vite command required by `AGENTS.md`, not `npm start`, and use
  the in-app browser following its skill instructions.
- Check narrow and wide windows, a long repository name, duplicate worktree display names,
  branch names that truncate, and enough worktrees to scroll.
- Check for runtime/console errors.

## Non-goals

- Do not replace the shared snapshot contract yet.
- Do not remove all legacy project IPC or persistence code.
- Do not support duplicate windows for one repository.
- Do not redesign details, diff viewer, audit, or settings beyond changes required for
  repository scoping.
- Do not implement a cross-repository overview.

## Completion criteria

- Repository windows display one repository identity and a flat worktree list.
- All repository actions remain functional and scoped to the owning window.
- Project expansion/removal concepts are absent from the active repository interface.
- The compatibility snapshot adapter remains isolated and ready for work unit 9.
- Automated and live validations pass.
- Summarize component removals/reuse, navigation behavior, preview coverage, and the exact
  project-shaped compatibility code still remaining.
