<!-- Put a logo here -->

# Grafter

[![CI](https://github.com/blazewicz/grafter/actions/workflows/ci.yml/badge.svg)](https://github.com/blazewicz/grafter/actions/workflows/ci.yml)

> **Grafting** is the practice of joining parts of plants so they grow together as one.

**A compact desktop workflow for Git worktrees.**

## What is Grafter?

Grafter is a desktop companion for developers who use Git worktrees. It keeps local
repositories and their worktrees easy to find while you move between your IDE, terminal,
file manager, and GitHub.

- Automatically discovers worktrees for managed repositories.
- Opens a worktree in Visual Studio Code or your file manager.
- Shows checked-out branches, worktree status, latest commit details, and pull requests.
- Wraps familiar command-line tools such as `git` and `gh`.

## What Grafter isn't

- A merge tool.
- An IDE.
- A replacement for the Git CLI.
- A replacement for GitHub Desktop.
- An agentic coding tool.

## Why use it?

Grafter may be useful if:

- Coding agents have created enough worktrees that navigating them by hand has become
  cumbersome.
- You keep separate workspaces for development and review work and want to move between
  them without repeatedly stashing changes.

## When is it not for you?

- You are new to Git and want a beginner-friendly graphical replacement for the Git CLI.
- You need Windows support. Grafter targets macOS and Linux, but Linux is not currently
  tested by the maintainer.

## Features

- Discover, create, inspect, and remove worktrees for managed repositories.
- View worktree paths, clean or dirty status, and checked-out branches.
- Switch between available local branches.
- View the latest commit, including its message, author, timestamp, and diff summary.
- See pull request status and open the pull request in your browser.
- Open a worktree in Visual Studio Code or your file manager.
- Review Git and GitHub CLI commands, output, and failures in the audit log.
- Copy any recorded command and run it yourself in a terminal.
- Review the exact command before approving destructive worktree removal or a
  project-provided setup script.

## Requirements

- macOS or Linux
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

## Project setup scripts

A repository can provide a `.grafter.json` file:

```json
{
  "setupScript": "npm install"
}
```

Grafter shows the exact shell, arguments, script, and working directory before asking for
approval. A local per-project override can also be configured in Settings; local overrides
take precedence over `.grafter.json`.

## Disclaimer

Yes, this project is vibecoded — mostly with GPT-5.6 Sol in Codex.
