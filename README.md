# Grafter

Grafter is a macOS and Linux desktop app for creating, inspecting, and removing Git
worktrees. It wraps `git`, `gh`, and explicitly approved setup scripts while keeping every
command and its output visible in the audit panel.

## Development

Requirements: Node.js 22 or newer, Git, and optionally the GitHub CLI (`gh`).

```sh
npm install
npm start
```

Run the complete automated check suite with:

```sh
npm run check
```

Build the platform application with `npm run package`, or create distributables with
`npm run make`.

## Worktree setup scripts

A repository may commit a `.grafter.json` file:

```json
{
  "setupScript": "npm install"
}
```

The script is executed through the user's `bash` or `zsh` only after Grafter displays the
exact shell, arguments, script, and working directory for approval. A local per-project
override can be stored in Settings; local overrides take precedence over `.grafter.json`.

## Security model

- The renderer is sandboxed and has no Node.js access.
- Git and GitHub CLI operations are spawned directly with argument arrays, never shell
  strings.
- Destructive worktree removal and repository-provided scripts use short-lived approval
  tokens bound to the command shown to the user.
- Main clones cannot be removed by Grafter, and dirty worktree removal is refused by Git.
- Persistent state is written atomically to Electron's per-user application data folder.

Windows is not a target. Runtime behavior is designed for macOS and Linux with `bash` or
`zsh` available for project setup scripts.
