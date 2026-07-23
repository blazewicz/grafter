# AGENTS.md

This file applies to the entire repository.

## Project

Grafter is an Electron app for managing Git worktrees. It is a transparent wrapper around
the `git` and `gh` command-line tools, with a compact interface inspired by native macOS
developer tools. Primary supported platform is macOS. It might work on Linux, but we don't
really care. Windows is out of scope.

Requirements:

- Node.js 22 or newer
- Git at runtime
- GitHub CLI (`gh`) for GitHub features
- `bash` or `zsh` for project setup scripts

## Architecture

Keep Electron process boundaries explicit:

- `src/main/` owns filesystem access, persistence, process execution, and Electron APIs.
- `src/preload/` exposes a narrow typed bridge to the renderer.
- `src/renderer/` contains the React interface and browser-safe code.
- `src/shared/` contains serializable contracts and pure shared logic.
- `tests/` contains automated tests for domain logic.

When an IPC operation changes, keep its shared contract, channel, main-process handler,
preload bridge, renderer usage, and development preview implementation aligned.

## Security and command execution

These constraints are architectural invariants:

- Keep the renderer sandboxed with context isolation enabled and Node integration disabled.
- Never execute commands or perform filesystem writes directly from the renderer.
- Spawn `git` and `gh` with executable/argument arrays and `shell: false`; do not build shell
  command strings.
- Use shell execution only for project setup scripts through `bash` or `zsh`.
- Require explicit approval for destructive commands and project-provided scripts. Routine
  read-only commands do not require approval.
- Bind approval to the exact prepared command using an opaque, short-lived token. Do not
  accept command changes when approval is submitted.
- Record command attempts, output, failures, and declined approvals in the audit model.
- Do not silently force destructive Git operations.
- Keep IPC payloads explicit, narrow, and serializable. Never expose a general-purpose
  command runner to the renderer.
- Restrict external links to HTTPS and keep persistent state writes atomic.

## Concurrency and async safety

- Assume IPC handlers can overlap. Enforce locking, deduplication, and concurrency limits in
  the main process, not through renderer loading states.
- Serialize mutating Git operations per repository. Allow independent repositories and safe
  read-only operations to run concurrently.
- Use `p-map` for bounded batches of operations.
- Use a shared `p-limit` limiter when the limit must apply across multiple calls.
- Give background subprocesses their own limit below the total subprocess limit so interactive
  commands retain capacity.
- Serialize persistence as complete transactions: mutate, write, rename, and publish state in order.
- Every fire-and-forget promise must handle rejection. Unexpected background failures
  must remain observable.
- Ensure subprocess execution settles once and cleans up timers, listeners, and queued work
  on every terminal path.
- Bound captured subprocess output and live IPC update frequency. Never silently truncate
  output consumed by parsers.
- Add deterministic tests for concurrency limits, ordering, failure recovery, and lock release.

## Code and interface conventions

- Preserve strict TypeScript compiler settings and the existing lint rules.
- Avoid `any`, broad casts, non-null assertions, and disabled rules as shortcuts. Validate
  external data at its boundary.
- Prefer small pure helpers for parsing, paths, validation, and policy decisions.
- Use type-only imports where applicable.
- Clean up renderer subscriptions and asynchronous effects.
- Reuse the existing visual system and Lucide icons before adding dependencies.
- Keep the interface compact and restrained. Use subtle hierarchy and hover-revealed
  secondary actions rather than permanent clutter.
- Give icon-only controls accessible names and use semantic labels for dialogs and inputs.
- Preserve unrelated working-tree changes. Do not stage, commit, push, or release unless the
  user explicitly asks.
- Keep renderer components grouped by feature area under `src/renderer/components/`,
  and co-locate feature-specific hooks with their components.
- Don't bundle multiple components in a single source file, except tiny helpers very
  tightly coupled with the main component of the file.
- Keep `App.tsx` focused on cross-feature composition and shared orchestration; keep
  feature-local state and behavior in the component that owns it.

## Testing

Test everything that can reasonably be automated. Add or update tests for pure domain
logic, parsers, path rules, command policy, persistence, and security-sensitive behavior.

Organize tests under `tests/` by the major source boundary that owns the behavior, such as
main-process, shared, or renderer code. Mirror deeper source folders when it makes ownership
and navigation clearer, but do not reproduce the source tree mechanically. Keep test support
helpers near the layer they serve, and place tests that genuinely span multiple boundaries
in a dedicated integration area.

For renderer changes, also exercise the affected flow in a live preview or Electron and
check for runtime errors. For Electron or packaging changes, run a platform package build.

Before handing work back, run:

```sh
npm run check
```

Do not claim completion with failing type checking, linting, formatting, or tests.
Keep the npm quality scripts, `.husky/pre-commit`, and `.github/workflows/ci.yml` aligned
when checks change. Do not bypass hooks or weaken CI checks as part of unrelated work.

### Codex In-app Browser

If you're Codex and you need to preview the app then instead of running `npm start`
run `./node_modules/.bin/vite --config vite.renderer.config.ts --host 127.0.0.1` to
start a local server and connect to it using Codes In-app Browser on http://127.0.0.1:5173.

When running from Visual Studio Code, the browser is not available. Don't attempt using it.

## Commands

```sh
npm install              # Install dependencies
npm start                # Run Electron in development mode
npm run check            # Typecheck, lint, format-check, and test
npm run typecheck        # TypeScript only
npm run lint             # ESLint only
npm run format           # Check formatting
npm run format:write     # Apply formatting
npm test                 # Run tests once
npm run test:watch       # Run tests in watch mode
npm run check:static     # Typecheck, lint, and format-check
npm run package          # Build an unpacked platform app
npm run make             # Build distributable artifacts
```

Electron Forge packaging may need network access for platform artifacts.
