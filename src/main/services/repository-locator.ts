import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { CommandContext } from '../../shared/contracts';
import type { CommandResult, CommandRunner } from '../commands';

export interface RepositoryLocation {
  /** The canonical runtime identity for the repository. */
  commonDirectoryPath: string;
  mainWorktreePath: string;
  selectedWorktreePath: string;
  name: string;
}

interface ListedWorktree {
  path: string;
  prunable: boolean;
}

export class RepositoryLocator {
  static readonly commandTimeoutMs = 60_000;

  constructor(private readonly runner: CommandRunner) {}

  async locate(selectedPath: string): Promise<RepositoryLocation> {
    const selectedDirectory = await canonicalDirectory(selectedPath);
    const context: CommandContext = { kind: 'application' };
    const validation = await this.#runGit(
      selectedDirectory,
      ['rev-parse', '--is-bare-repository'],
      'Validate Git worktree',
      context,
    );
    if (validation.record.exitCode !== 0) {
      throw new Error(`The selected folder is not a Git worktree: ${selectedPath}`);
    }

    const bare = validation.stdout.trim();
    if (bare === 'true') {
      throw new Error('Bare Git repositories are not supported. Select a worktree.');
    }
    if (bare !== 'false') {
      throw new Error('Git returned an invalid repository type.');
    }

    const selectedTopLevel = await canonicalGitPath(
      await this.#git(
        selectedDirectory,
        ['rev-parse', '--show-toplevel'],
        'Resolve selected worktree',
        context,
      ),
      'selected worktree',
    );
    const commonDirectoryPath = await canonicalGitPath(
      await this.#git(
        selectedDirectory,
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        'Resolve Git common directory',
        context,
      ),
      'Git common directory',
    );
    const worktreeOutput = (
      await this.#git(
        selectedTopLevel,
        ['worktree', 'list', '--porcelain'],
        'Discover repository worktrees',
        context,
      )
    ).stdout;
    const listedWorktrees = parseListedWorktrees(worktreeOutput);
    const mainWorktree = listedWorktrees[0];
    if (!mainWorktree) throw new Error('Git did not report a main worktree.');
    const mainWorktreePath = await canonicalListedPath(mainWorktree);
    const selectedWorktreePath = await findSelectedWorktree(
      listedWorktrees,
      selectedTopLevel,
    );

    return {
      commonDirectoryPath,
      mainWorktreePath,
      selectedWorktreePath,
      name: path.basename(mainWorktreePath),
    };
  }

  async #git(
    cwd: string,
    args: string[],
    purpose: string,
    context: CommandContext,
  ): Promise<CommandResult> {
    const result = await this.#runGit(cwd, args, purpose, context);
    if (result.record.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() || `Git command failed: ${result.record.displayCommand}`,
      );
    }
    return result;
  }

  #runGit(
    cwd: string,
    args: string[],
    purpose: string,
    context: CommandContext,
  ): Promise<CommandResult> {
    return this.runner.run({
      context,
      tool: 'git',
      execution: {
        admission: 'limited',
        timeoutMs: RepositoryLocator.commandTimeoutMs,
      },
      executable: 'git',
      args,
      cwd,
      purpose,
      isReadOnly: true,
    });
  }
}

async function canonicalDirectory(selectedPath: string): Promise<string> {
  let resolved: string;
  try {
    resolved = await realpath(selectedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`The selected folder does not exist: ${selectedPath}`, {
        cause: error,
      });
    }
    throw new Error(`Could not access the selected folder: ${selectedPath}`, {
      cause: error,
    });
  }

  if (!(await stat(resolved)).isDirectory()) {
    throw new Error(`The selected path is not a folder: ${selectedPath}`);
  }
  return resolved;
}

async function canonicalGitPath(
  result: CommandResult,
  description: string,
): Promise<string> {
  const gitPath = result.stdout.trim();
  if (!gitPath) throw new Error(`Git did not report the ${description}.`);
  try {
    return await realpath(gitPath);
  } catch (error) {
    throw new Error(`Git reported an unavailable ${description}: ${gitPath}`, {
      cause: error,
    });
  }
}

function parseListedWorktrees(output: string): ListedWorktree[] {
  const rawBlocks = output
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);
  if (!rawBlocks.length) throw new Error('Git did not report any repository worktrees.');

  return rawBlocks.map((rawBlock) => {
    let worktreePath: string | undefined;
    let head: string | undefined;
    let branch: string | undefined;
    let detached = false;
    let bare = false;
    let prunable = false;

    for (const rawLine of rawBlock.split('\n')) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      const separator = line.indexOf(' ');
      const key = separator === -1 ? line : line.slice(0, separator);
      const value = separator === -1 ? '' : line.slice(separator + 1);
      if (key === 'worktree') {
        if (worktreePath !== undefined || !value) return malformedWorktreeList();
        worktreePath = value;
      } else if (key === 'HEAD') {
        if (head !== undefined || !value) return malformedWorktreeList();
        head = value;
      } else if (key === 'branch') {
        if (branch !== undefined || !value) return malformedWorktreeList();
        branch = value;
      } else if (key === 'detached') {
        detached = true;
      } else if (key === 'bare') {
        bare = true;
      } else if (key === 'prunable') {
        prunable = true;
      }
    }

    if (bare) {
      throw new Error('Bare Git repositories are not supported. Select a worktree.');
    }
    if (!worktreePath || !head || Boolean(branch) === detached) {
      return malformedWorktreeList();
    }
    return { path: worktreePath, prunable };
  });
}

function malformedWorktreeList(): never {
  throw new Error('Git returned an incomplete worktree list.');
}

async function canonicalListedPath(worktree: ListedWorktree): Promise<string> {
  try {
    return await realpath(worktree.path);
  } catch (error) {
    throw new Error(`Git reported an unavailable main worktree: ${worktree.path}`, {
      cause: error,
    });
  }
}

async function findSelectedWorktree(
  worktrees: ListedWorktree[],
  selectedTopLevel: string,
): Promise<string> {
  for (const worktree of worktrees) {
    try {
      const candidate = await realpath(worktree.path);
      if (candidate === selectedTopLevel) return candidate;
    } catch (error) {
      if (worktree.prunable && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw new Error(`Git reported an unavailable worktree: ${worktree.path}`, {
        cause: error,
      });
    }
  }
  throw new Error('The selected folder is missing from Git’s worktree list.');
}
