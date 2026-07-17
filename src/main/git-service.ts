import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
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

export class GitService {
  constructor(private readonly runner: CommandRunner) {}

  async inspectMainClone(selectedPath: string): Promise<Omit<Project, 'id'>> {
    const chosen = await realpath(selectedPath);
    const topLevel = (
      await this.#git(
        chosen,
        ['rev-parse', '--show-toplevel'],
        'Validate Git repository',
        true,
      )
    ).stdout.trim();
    const worktreeOutput = (
      await this.#git(
        topLevel,
        ['worktree', 'list', '--porcelain'],
        'Find main clone',
        true,
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
    const output = (
      await this.#git(
        project.path,
        ['worktree', 'list', '--porcelain'],
        `Discover ${project.name} worktrees`,
        true,
      )
    ).stdout;
    return parseWorktreePorcelain(output, project.id);
  }

  async listBranches(project: Project): Promise<string[]> {
    const result = await this.#git(
      project.path,
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin'],
      `List branches in ${project.name}`,
      true,
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
    const localBranch = await this.#gitAllowFailure(
      project.path,
      ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      `Check local branch ${branch}`,
      true,
    );
    const args =
      localBranch.record.exitCode === 0
        ? ['worktree', 'add', worktreePath, branch]
        : ['worktree', 'add', '--track', '-b', branch, worktreePath, `origin/${branch}`];
    await this.#git(project.path, args, `Create worktree for ${branch}`, false);
  }

  removeSpec(worktree: Worktree, mainClonePath: string): CommandSpec {
    return {
      tool: 'git',
      executable: 'git',
      args: ['worktree', 'remove', worktree.path],
      cwd: mainClonePath,
      purpose: `Remove the ${worktree.branch} worktree`,
      isReadOnly: false,
      requiresApproval: true,
    };
  }

  async details(project: Project, worktree: Worktree): Promise<WorktreeDetails> {
    const pullRequest = await this.#pullRequest(worktree);
    const targetBranch = pullRequest?.baseBranch ?? (await this.#defaultBranch(project));
    const diff = await this.#diffStats(worktree.path, targetBranch);
    return {
      ...worktree,
      projectName: project.name,
      targetBranch,
      diff,
      ...(pullRequest ? { pullRequest } : {}),
    };
  }

  async status(worktree: Worktree): Promise<WorktreeStatus> {
    const result = await this.#git(
      worktree.path,
      ['status', '--porcelain=v1', '--untracked-files=normal'],
      `Check ${worktree.branch} worktree status`,
      true,
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

  setupSpec(worktreePath: string, script: string): CommandSpec {
    const configuredShell = process.env.SHELL;
    const executable =
      configuredShell && ['bash', 'zsh'].includes(path.basename(configuredShell))
        ? configuredShell
        : process.platform === 'darwin'
          ? '/bin/zsh'
          : '/bin/bash';
    return {
      tool: 'shell',
      executable,
      args: ['-lc', script],
      cwd: worktreePath,
      purpose: 'Run the project worktree setup script',
      isReadOnly: false,
      requiresApproval: true,
    };
  }

  createProject(details: Omit<Project, 'id'>): Project {
    return { id: randomUUID(), ...details };
  }

  async #defaultBranch(project: Project): Promise<string> {
    const remote = await this.#gitAllowFailure(
      project.path,
      ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      'Resolve default branch',
      true,
    );
    if (remote.record.exitCode === 0)
      return remote.stdout.trim().replace(/^origin\//, '');
    const current = await this.#git(
      project.path,
      ['branch', '--show-current'],
      'Resolve current branch',
      true,
    );
    return current.stdout.trim() || 'main';
  }

  async #diffStats(worktreePath: string, targetBranch: string): Promise<DiffStats> {
    const result = await this.#gitAllowFailure(
      worktreePath,
      ['diff', '--numstat', `${targetBranch}...HEAD`],
      `Compare with ${targetBranch}`,
      true,
    );
    if (result.record.exitCode === 0) return parseNumStat(result.stdout);
    const remoteResult = await this.#git(
      worktreePath,
      ['diff', '--numstat', `origin/${targetBranch}...HEAD`],
      `Compare with origin/${targetBranch}`,
      true,
    );
    return parseNumStat(remoteResult.stdout);
  }

  async #pullRequest(worktree: Worktree): Promise<PullRequest | undefined> {
    if (worktree.branch === '(detached)') return undefined;
    try {
      const result = await this.runner.run({
        tool: 'github',
        executable: 'gh',
        args: [
          'pr',
          'view',
          worktree.branch,
          '--json',
          'number,title,url,state,baseRefName',
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
        state: string;
        baseRefName: string;
      };
      return {
        number: parsed.number,
        title: parsed.title,
        url: parsed.url,
        state: parsed.state,
        baseBranch: parsed.baseRefName,
      };
    } catch {
      return undefined;
    }
  }

  async #git(
    cwd: string,
    args: string[],
    purpose: string,
    isReadOnly: boolean,
  ): Promise<CommandResult> {
    const result = await this.#gitAllowFailure(cwd, args, purpose, isReadOnly);
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
  ): Promise<CommandResult> {
    return this.runner.run({
      tool: 'git',
      executable: 'git',
      args,
      cwd,
      purpose,
      isReadOnly,
    });
  }
}
