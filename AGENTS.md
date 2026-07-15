# AGENTS.md

This file applies to the entire repository.

## Project

Grafter is an Electron app for managing Git worktrees. It is a transparent wrapper around
the `git` and `gh` command-line tools, with a compact interface inspired by native macOS
developer tools. Supported platforms are macOS and Linux; Windows is out of scope.

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

## Testing

Test everything that can reasonably be automated. Add or update tests for pure domain
logic, parsers, path rules, command policy, persistence, and security-sensitive behavior.

For renderer changes, also exercise the affected flow in a live preview or Electron and
check for runtime errors. For Electron or packaging changes, run a platform package build.

Before handing work back, run:

```sh
npm run check
```

Do not claim completion with failing type checking, linting, formatting, or tests.

## Commands

```sh
npm install              # Install dependencies
npm start                # Run Electron in development
npm run check            # Typecheck, lint, format-check, and test
npm run typecheck        # TypeScript only
npm run lint             # ESLint only
npm run format           # Check formatting
npm run format:write     # Apply formatting
npm test                 # Run tests once
npm run test:watch       # Run tests in watch mode
npm run package          # Build an unpacked platform app
npm run make             # Build distributable artifacts
```

Electron Forge packaging may need network access for platform artifacts.
