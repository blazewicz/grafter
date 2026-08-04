# Work unit 3: Prepare renderer seams and the welcome experience

You are implementing the third work unit of Grafter's repository-scoped windows migration.
Complete the renderer and supporting API changes; do not stop at a mockup or plan.

## Read first

Read and follow:

- `AGENTS.md`
- `.agents/skills/write-renderer-component-tests/SKILL.md` in full
- `docs/adr/0001-repository-scoped-windows.md`
- `docs/repository-scoped-windows-migration-plan.md`
- the completed work units 1 and 2

The renderer-test skill is mandatory for this unit because React components and renderer
tests are changing. Inspect the repository's current code and reuse its factories,
scenarios, visual system, and Lucide icons. Preserve unrelated changes. Do not stage,
commit, push, or open a pull request.

## Product context

The final interface has a persistent welcome state and repository windows with a flat
worktree list. The application is still using its current global project tree during this
unit. We want reusable renderer seams without switching the product model prematurely.

Recent repository metadata should now exist in persisted state from work unit 2. Recent
entries are display/navigation data and must not trigger eager Git inspection.

## Goal

Make two mostly behavior-preserving renderer extractions:

1. Extract the worktree list and new-worktree flow from the project tree so the same code
   can later render without a project node wrapper.
2. Separate transient boot loading from the persistent empty/welcome experience, and show
   recent repositories in that welcome experience.

Keep populated multi-project rendering and behavior unchanged.

## Requirements

### Worktree-list seam

- Extract a focused component for sorted worktree rows and the inline new-worktree flow.
- Keep feature components grouped under the existing renderer feature area; do not bundle
  unrelated components into one file.
- Reuse current path display, sorting, tooltips, icons, accessible names, remove behavior,
  and creation behavior.
- `ProjectNode` should compose the extracted component so current markup and interactions
  change as little as practical.
- Do not flatten the production sidebar yet.

### Welcome seam

- Treat the current splash as transient loading only.
- Give the no-project state a proper welcome component that offers **Open Repository...**
  and displays ordered recent repositories.
- Expose recent metadata additively through the existing snapshot/API; do not replace the
  projects array yet.
- Opening a recent item may use a narrow ID-based IPC/API that resolves its stored path and
  feeds the current add-project flow. Do not expose a general filesystem path opener to the
  renderer.
- Validate a recent repository only when the user opens it. On failure, keep the welcome
  screen usable and show the existing error feedback.
- The current picker may continue to add the repository to the global tree during this
  compatibility unit.
- Preserve compact styling and keyboard/accessibility behavior.
- Update the development preview implementation whenever the shared API changes.

## Tests

Use Testing Library, user-event, shared Fishery/faker factories, and reusable scenarios.
Cover at least:

- populated project trees still rendering and interacting as before;
- extracted worktree sorting, selection, removal, creation, and cancellation;
- loading state being distinct from an empty welcome state;
- recent entries ordered and rendered without Git inspection;
- opening a recent entry successfully;
- a failed/missing recent entry leaving the welcome view usable; and
- accessible names for picker, recent entries, and icon-only actions.

Run the renderer in the required Vite preview and inspect both populated and empty states
for runtime errors and visual regressions. Use the in-app browser when available, following
its skill instructions.

## Non-goals

- Do not enable repository-per-window behavior.
- Do not remove project expansion or the project root row.
- Do not switch to a singular snapshot contract.
- Do not remove project CRUD IPC.
- Do not redesign the entire sidebar or settings interface.

## Completion criteria

- The existing populated project tree behaves as before.
- The no-project state is a persistent welcome experience with lazy recent-repository
  opening.
- Extracted worktree UI can be reused later as a flat list.
- Preview APIs and renderer test support remain aligned.
- `npm run check` passes, and the live preview has been checked for runtime errors.
- Summarize new component/API seams and any compatibility behavior the window cutover must
  replace.
