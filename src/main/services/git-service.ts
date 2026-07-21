import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  projectCommandContext,
  worktreeCommandContext,
} from '../../shared/command-context';
import type {
  CommitDetails,
  CommandContext,
  DiffFilePatch,
  DiffFileRequest,
  DiffFileSummary,
  DiffSession,
  DiffStats,
  Project,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../../shared/contracts';
import {
  parseCommitDetails,
  parseDiffFiles,
  parseNumStat,
  parseUnifiedDiff,
  parseWorktreePorcelain,
  parseWorktreeStatus,
} from '../../shared/git-parsers';
import type { CommandResult, CommandSpec } from '../commands';
import type { CommandRunner } from '../commands';

interface StoredDiffSession {
  worktreeId: string;
  worktreePath: string;
  context: CommandContext;
  baseSha: string;
  headSha: string;
  files: Map<string, DiffFileSummary>;
}

export class GitService {
  static readonly maximumDiffSessions = 12;

  readonly #diffSessions = new Map<string, StoredDiffSession>();

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
      `Switch ${worktree.displayName} to ${branch}`,
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
    const [commit, targetBranch] = await Promise.all([
      this.#latestCommit(worktree, context),
      this.#comparisonTargetBranch(project, worktree, context),
    ]);
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
      ...(commit ? { commit } : {}),
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

  async openDiff(project: Project, worktree: Worktree): Promise<DiffSession> {
    const context = worktreeCommandContext(worktree);
    const targetBranch = await this.#comparisonTargetBranch(project, worktree, context);
    if (
      !targetBranch ||
      (worktree.pullRequest === undefined && targetBranch === worktree.branch)
    ) {
      throw new Error('This branch does not have a committed comparison target.');
    }

    const headSha = (
      await this.#git(
        worktree.path,
        ['rev-parse', '--verify', 'HEAD'],
        `Resolve ${worktree.branch} revision`,
        true,
        context,
      )
    ).stdout.trim();
    const baseSha = await this.#mergeBase(worktree.path, targetBranch, headSha, context);
    const [nameStatus, numStat] = await Promise.all([
      this.#git(
        worktree.path,
        ['diff', '--name-status', '-z', '--find-renames', baseSha, headSha],
        `List changes against ${targetBranch}`,
        true,
        context,
      ),
      this.#git(
        worktree.path,
        ['diff', '--numstat', '-z', '--find-renames', baseSha, headSha],
        `Read change stats against ${targetBranch}`,
        true,
        context,
      ),
    ]);
    const files = parseDiffFiles(nameStatus.stdout, numStat.stdout);
    const id = randomUUID();
    const session: DiffSession = {
      id,
      worktreeId: worktree.id,
      branch: worktree.branch,
      targetBranch,
      baseSha,
      headSha,
      stats: {
        files: files.length,
        additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
        deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
      },
      files,
    };

    this.#diffSessions.set(id, {
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      context,
      baseSha,
      headSha,
      files: new Map(files.map((file) => [file.id, file])),
    });
    this.#trimDiffSessions();
    return structuredClone(session);
  }

  async diffFile(request: DiffFileRequest): Promise<DiffFilePatch> {
    const session = this.#diffSessions.get(request.sessionId);
    if (!session) throw new Error('The diff session expired. Close and reopen it.');
    const file = session.files.get(request.fileId);
    if (!file) throw new Error('The requested file is not part of this diff.');
    if (file.binary) return { fileId: file.id, binary: true, hunks: [] };

    const paths = [
      ...(file.previousPath && file.previousPath !== file.path
        ? [file.previousPath]
        : []),
      file.path,
    ];
    const result = await this.#git(
      session.worktreePath,
      [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--unified=3',
        '--find-renames',
        session.baseSha,
        session.headSha,
        '--',
        ...paths,
      ],
      `Read diff for ${file.path}`,
      true,
      session.context,
    );
    return parseUnifiedDiff(file.id, result.stdout);
  }

  diffFilePath(request: DiffFileRequest): string {
    const session = this.#diffSessions.get(request.sessionId);
    if (!session) throw new Error('The diff session expired. Close and reopen it.');
    const file = session.files.get(request.fileId);
    if (!file) throw new Error('The requested file is not part of this diff.');
    if (file.status === 'deleted') {
      throw new Error('Deleted files cannot be opened in an editor.');
    }

    const filePath = path.resolve(session.worktreePath, file.path);
    const relativePath = path.relative(session.worktreePath, filePath);
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error('The requested file is outside its worktree.');
    }
    return filePath;
  }

  closeDiff(sessionId: string): void {
    this.#diffSessions.delete(sessionId);
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

  #comparisonTargetBranch(
    project: Project,
    worktree: Worktree,
    context: CommandContext,
  ): Promise<string | undefined> {
    return worktree.pullRequest?.baseBranch
      ? Promise.resolve(worktree.pullRequest.baseBranch)
      : this.#remoteHeadBranch(project, context);
  }

  async #mergeBase(
    worktreePath: string,
    targetBranch: string,
    headSha: string,
    context: CommandContext,
  ): Promise<string> {
    const local = await this.#gitAllowFailure(
      worktreePath,
      ['merge-base', targetBranch, headSha],
      `Resolve merge base with ${targetBranch}`,
      true,
      context,
    );
    if (local.record.exitCode === 0 && local.stdout.trim()) return local.stdout.trim();

    const remoteBranch = `origin/${targetBranch}`;
    return (
      await this.#git(
        worktreePath,
        ['merge-base', remoteBranch, headSha],
        `Resolve merge base with ${remoteBranch}`,
        true,
        context,
      )
    ).stdout.trim();
  }

  async #latestCommit(
    worktree: Worktree,
    context: CommandContext,
  ): Promise<CommitDetails | undefined> {
    if (!worktree.head) return undefined;
    const result = await this.#gitAllowFailure(
      worktree.path,
      [
        'log',
        '-1',
        '--numstat',
        '--diff-merges=first-parent',
        '--format=%H%n%an%n%ae%n%aI%n%s%n%b%x00',
        'HEAD',
      ],
      'Read latest commit',
      true,
      context,
    );
    return result.record.exitCode === 0 ? parseCommitDetails(result.stdout) : undefined;
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

  #trimDiffSessions(): void {
    while (this.#diffSessions.size > GitService.maximumDiffSessions) {
      const oldestId = this.#diffSessions.keys().next().value;
      if (!oldestId) return;
      this.#diffSessions.delete(oldestId);
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
