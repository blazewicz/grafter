<!-- Put a logo here -->

# Grafter

[![CI](https://github.com/blazewicz/grafter/actions/workflows/ci.yml/badge.svg)](https://github.com/blazewicz/grafter/actions/workflows/ci.yml)

> **Grafting** is the practice of joining parts of plants so they grow together as one.

**A compact GUI for navigating git worktrees.**

## What is Grafter?

Grafter is a desktop companion for developers who use Git worktrees. Open any local
repository and Grafter finds all of its worktrees and shows them in a compact window,
with many useful insights, shortcuts to GitHub and your IDE and full transparency of
everything that happens under the hood.

Grafter is a GUI wrapper for CLI commands `git` and `gh`. No extra configuration is
needed if you already have these two available. Grafter will show you all of the
commands it runs.

## What Grafter isn't

- An IDE.
- A merge tool.
- A replacement for the Git CLI.

## Why would you need it?

- You use worktrees to isolate work units you work on against a single repo.
- You work with different AI coding tools with worktrees per chat.
- You're tired of typing the same commands over and over again and prefer a couple of clicks.

## When is it not for you?

- You are new to Git and simply want a beginner-friendly graphical replacement for the Git CLI.
- You need Windows support. Grafter is designed primarily for macOS; it may work on Linux, but Linux is not currently tested by the maintainer.

## Requirements

- macOS
- Node.js 22 or newer
- Git
- GitHub CLI (`gh`) for GitHub features
- `bash` or `zsh` for project setup scripts

## Development

Install dependencies and start Grafter in development mode:

```sh
npm install
npm start
```

Run the complete quality suite—type checking, linting, formatting checks, and tests—with:

```sh
npm run check
```

Build an unpacked application with `npm run package`, or create platform distributables
with `npm run make`.

## Repository setup scripts

A repository can provide a `.grafter.json` file:

```json
{
  "setupScript": "npm install"
}
```

Grafter shows the exact shell, arguments, script, and working directory before asking for
approval. A local override for the open repository can also be configured in Settings;
local overrides take precedence over `.grafter.json`.
