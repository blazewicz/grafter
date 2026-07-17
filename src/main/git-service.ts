import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectCommandContext, worktreeCommandContext } from '../shared/command-context';
import { pullRequestStateFromGitHub } from '../shared/contracts';
import type {
  CommandContext,
  DiffStats,
  Project,
  PullRequest,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../shared/contracts';
import {
  parseNumStat,
  parseWorktreePorcelain,
  parseWorktreeStatus,
} from '../shared/git-parsers';
import type { CommandResult, CommandSpec } from './commands';
import type { CommandRunner } from './commands';
import { mapWithConcurrency } from './concurrency';

const baseBranchLookupConcurrency = 5;

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

  async listBranchWorkspaces(
    project: Project,
  ): Promise<{ defaultBranch: string; worktrees: Worktree[] }> {
    const [worktrees, defaultBranch] = await Promise.all([
      this.listWorktrees(project),
      this.#defaultBranch(project, projectCommandContext(project)),
    ]);
    const baseBranches = await mapWithConcurrency(
      worktrees,
      baseBranchLookupConcurrency,
      (worktree) => this.#pullRequestBase(worktree),
    );

    return {
      defaultBranch,
      worktrees: worktrees.map((worktree, index) => {
        const baseBranch = baseBranches[index];
        return baseBranch ? { ...worktree, baseBranch } : worktree;
      }),
    };
  }

  async listBranches(project: Project): Promise<string[]> {
    const context = projectCommandContext(project);
    const result = await this.#git(
      project.path,
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin'],
      `List branches in ${project.name}`,
      true,
      context,
    );
    const branches = result.stdout
      .split('\n')
      .map((branch) => branch.trim().replace(/^origin\//, ''))
      .filter((branch) => branch && branch !== 'HEAD');
    return [...new Set(branches)].sort((a, b) => a.localeCompare(b));
  }

  async addWorktree(
    project: Project,
    worktreePath: string,
    branch: string,
  ): Promise<void> {
    const context = projectCommandContext(project);
    const localBranch = await this.#gitAllowFailure(
      project.path,
      ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      `Check local branch ${branch}`,
      true,
      context,
    );
    const args =
      localBranch.record.exitCode === 0
        ? ['worktree', 'add', worktreePath, branch]
        : ['worktree', 'add', '--track', '-b', branch, worktreePath, `origin/${branch}`];
    await this.#git(project.path, args, `Create worktree for ${branch}`, false, context);
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
    const pullRequest = await this.#pullRequest(worktree, context);
    const targetBranch =
      pullRequest?.baseBranch ??
      worktree.baseBranch ??
      (await this.#defaultBranch(project, context));
    const diff =
      worktree.branch === targetBranch
        ? { files: 0, additions: 0, deletions: 0 }
        : await this.#diffStats(worktree.path, targetBranch, context);
    return {
      ...worktree,
      projectName: project.name,
      targetBranch,
      diff,
      ...(pullRequest ? { pullRequest } : {}),
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

  async #defaultBranch(project: Project, context: CommandContext): Promise<string> {
    const remote = await this.#gitAllowFailure(
      project.path,
      ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      'Resolve default branch',
      true,
      context,
    );
    if (remote.record.exitCode === 0)
      return remote.stdout.trim().replace(/^origin\//, '');
    const current = await this.#git(
      project.path,
      ['branch', '--show-current'],
      'Resolve current branch',
      true,
      context,
    );
    return current.stdout.trim() || 'main';
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

  async #pullRequest(
    worktree: Worktree,
    context: CommandContext,
  ): Promise<PullRequest | undefined> {
    if (worktree.branch === '(detached)') return undefined;
    try {
      const result = await this.runner.run({
        context,
        tool: 'github',
        executable: 'gh',
        args: [
          'pr',
          'view',
          worktree.branch,
          '--json',
          'number,title,url,state,isDraft,baseRefName',
        ],
        cwd: worktree.path,
        purpose: `Find the pull request for ${worktree.branch}`,
        isReadOnly: true,
      });
      if (result.record.exitCode !== 0) return undefined;
      const parsed = JSON.parse(result.stdout) as {
        number: number;
        title: string;
        url: string;
        state: unknown;
        isDraft: unknown;
        baseRefName: string;
      };
      const state = pullRequestStateFromGitHub(parsed.state, parsed.isDraft);
      if (!state) return undefined;
      return {
        number: parsed.number,
        title: parsed.title,
        url: parsed.url,
        state,
        baseBranch: parsed.baseRefName,
      };
    } catch {
      return undefined;
    }
  }

  async #pullRequestBase(worktree: Worktree): Promise<string | undefined> {
    if (worktree.branch === '(detached)') return undefined;
    try {
      const result = await this.runner.run({
        context: worktreeCommandContext(worktree),
        tool: 'github',
        executable: 'gh',
        args: ['pr', 'view', worktree.branch, '--json', 'baseRefName'],
        cwd: worktree.path,
        purpose: `Find the base branch for ${worktree.branch}`,
        isReadOnly: true,
      });
      if (result.record.exitCode !== 0) return undefined;
      const parsed: unknown = JSON.parse(result.stdout);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('baseRefName' in parsed) ||
        typeof parsed.baseRefName !== 'string' ||
        !parsed.baseRefName
      ) {
        return undefined;
      }
      return parsed.baseRefName;
    } catch {
      return undefined;
    }
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
