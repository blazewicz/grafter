import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  projectCommandContext,
  worktreeCommandContext,
} from '../../shared/command-context';
import type {
  CommandContext,
  DiffStats,
  Project,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../../shared/contracts';
import {
  parseNumStat,
  parseWorktreePorcelain,
  parseWorktreeStatus,
} from '../../shared/git-parsers';
import type { CommandResult, CommandSpec } from '../commands';
import type { CommandRunner } from '../commands';

export class GitService {
  constructor(private readonly runner: CommandRunner) {}

  async inspectMainClone(selectedPath: string): Promise<Omit<Project, 'id'>> {
    const context: CommandContext = { kind: 'application' };
    const chosen = await realpath(selectedPath);
    const topLevel = (
      await this.#git(
        chosen,
        ['rev-parse', '--show-toplevel'],
        'Validate Git repository',
        true,
        context,
      )
    ).stdout.trim();
    const worktreeOutput = (
      await this.#git(
        topLevel,
        ['worktree', 'list', '--porcelain'],
        'Find main clone',
        true,
        context,
      )
    ).stdout;
    const firstPath = /^worktree (.+)$/m.exec(worktreeOutput)?.[1];
    if (!firstPath || (await realpath(firstPath)) !== (await realpath(topLevel))) {
      throw new Error(
        'Select the repository’s main clone, not one of its linked worktrees.',
      );
    }
    return { name: path.basename(topLevel), path: topLevel };
  }

  async listWorktrees(project: Project): Promise<Worktree[]> {
    const context = projectCommandContext(project);
    const output = (
      await this.#git(
        project.path,
        ['worktree', 'list', '--porcelain'],
        `Discover ${project.name} worktrees`,
        true,
        context,
      )
    ).stdout;
    return parseWorktreePorcelain(output, project.id);
  }

  async listBranches(project: Project): Promise<string[]> {
    const context = projectCommandContext(project);
    const result = await this.#git(
      project.path,
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      `List branches in ${project.name}`,
      true,
      context,
    );
    const branches = result.stdout
      .split('\n')
      .map((branch) => branch.trim())
      .filter(Boolean);
    return [...new Set(branches)].sort((a, b) => a.localeCompare(b));
  }

  async addWorktree(
    project: Project,
    worktreePath: string,
    branch: string,
  ): Promise<void> {
    const context = projectCommandContext(project);
    await this.#git(
      project.path,
      ['worktree', 'add', worktreePath, branch],
      `Create worktree for ${branch}`,
      false,
      context,
    );
  }

  async switchBranch(worktree: Worktree, branch: string): Promise<void> {
    await this.#git(
      worktree.path,
      ['switch', '--no-guess', '--', branch],
      `Switch ${worktree.name} to ${branch}`,
      false,
      worktreeCommandContext(worktree),
    );
  }

  removeSpec(project: Project, worktree: Worktree): CommandSpec {
    return {
      context: projectCommandContext(project),
      tool: 'git',
      executable: 'git',
      args: ['worktree', 'remove', worktree.path],
      cwd: project.path,
      purpose: `Remove the ${worktree.branch} worktree`,
      isReadOnly: false,
      requiresApproval: true,
    };
  }

  async details(project: Project, worktree: Worktree): Promise<WorktreeDetails> {
    const context = worktreeCommandContext(worktree);
    const targetBranch =
      worktree.pullRequest?.baseBranch ??
      (await this.#remoteHeadBranch(project, context));
    const comparableTarget =
      targetBranch &&
      (worktree.pullRequest !== undefined || targetBranch !== worktree.branch)
        ? targetBranch
        : undefined;
    const comparison = comparableTarget
      ? {
          targetBranch: comparableTarget,
          diff: await this.#diffStats(worktree.path, comparableTarget, context),
        }
      : {};
    return {
      ...worktree,
      projectName: project.name,
      ...comparison,
    };
  }

  async status(worktree: Worktree): Promise<WorktreeStatus> {
    const context = worktreeCommandContext(worktree);
    const result = await this.#git(
      worktree.path,
      ['status', '--porcelain=v1', '--untracked-files=normal'],
      `Check ${worktree.branch} worktree status`,
      true,
      context,
    );
    return parseWorktreeStatus(result.stdout);
  }

  async setupScript(project: Project): Promise<string | undefined> {
    if (project.setupScript?.trim()) return project.setupScript.trim();
    try {
      const config = JSON.parse(
        await readFile(path.join(project.path, '.grafter.json'), 'utf8'),
      ) as { setupScript?: unknown };
      return typeof config.setupScript === 'string' && config.setupScript.trim()
        ? config.setupScript.trim()
        : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new Error(`Could not read .grafter.json: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  setupSpec(worktree: Worktree, script: string): CommandSpec {
    const configuredShell = process.env.SHELL;
    const executable =
      configuredShell && ['bash', 'zsh'].includes(path.basename(configuredShell))
        ? configuredShell
        : process.platform === 'darwin'
          ? '/bin/zsh'
          : '/bin/bash';
    return {
      context: worktreeCommandContext(worktree),
      tool: 'shell',
      executable,
      args: ['-lc', script],
      cwd: worktree.path,
      purpose: 'Run the project worktree setup script',
      isReadOnly: false,
      requiresApproval: true,
    };
  }

  createProject(details: Omit<Project, 'id'>): Project {
    return { id: randomUUID(), ...details };
  }

  async #remoteHeadBranch(
    project: Project,
    context: CommandContext,
  ): Promise<string | undefined> {
    const remote = await this.#gitAllowFailure(
      project.path,
      ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      'Resolve remote HEAD',
      true,
      context,
    );
    if (remote.record.exitCode !== 0) return undefined;
    return remote.stdout.trim().replace(/^origin\//, '') || undefined;
  }

  async #diffStats(
    worktreePath: string,
    targetBranch: string,
    context: CommandContext,
  ): Promise<DiffStats> {
    const result = await this.#gitAllowFailure(
      worktreePath,
      ['diff', '--numstat', `${targetBranch}...HEAD`],
      `Compare with ${targetBranch}`,
      true,
      context,
    );
    if (result.record.exitCode === 0) return parseNumStat(result.stdout);
    const remoteResult = await this.#git(
      worktreePath,
      ['diff', '--numstat', `origin/${targetBranch}...HEAD`],
      `Compare with origin/${targetBranch}`,
      true,
      context,
    );
    return parseNumStat(remoteResult.stdout);
  }

  async #git(
    cwd: string,
    args: string[],
    purpose: string,
    isReadOnly: boolean,
    context: CommandContext,
  ): Promise<CommandResult> {
    const result = await this.#gitAllowFailure(cwd, args, purpose, isReadOnly, context);
    if (result.record.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() || `Git command failed: ${result.record.displayCommand}`,
      );
    }
    return result;
  }

  #gitAllowFailure(
    cwd: string,
    args: string[],
    purpose: string,
    isReadOnly: boolean,
    context: CommandContext,
  ): Promise<CommandResult> {
    return this.runner.run({
      context,
      tool: 'git',
      executable: 'git',
      args,
      cwd,
      purpose,
      isReadOnly,
    });
  }
}
