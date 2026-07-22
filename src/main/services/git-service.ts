import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
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
import { parseGitHubRepositoryFromRemotes } from '../../shared/github';
import type { CommandResult, CommandSpec } from '../commands';
import type { CommandRunner } from '../commands';

interface StoredDiffSession {
  repositoryPath: string;
  editorWorktreePath?: string;
  context: CommandContext;
  baseSha: string;
  headSha: string;
  files: Map<string, DiffFileSummary>;
}

export class GitService {
  static readonly maximumDiffSessions = 12;
  static readonly maximumConcurrentDiffFileReads = 3;

  readonly #diffSessions = new Map<string, StoredDiffSession>();
  readonly #diffFileReadsLimit = pLimit(GitService.maximumConcurrentDiffFileReads);

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
    const targetBranch = await this.#comparisonTargetBranch(
      project,
      worktree,
      worktreeCommandContext(worktree),
    );
    if (
      !targetBranch ||
      (worktree.pullRequest === undefined && targetBranch === worktree.branch)
    ) {
      throw new Error('This branch does not have a committed comparison target.');
    }

    return this.#openBranchDiff(project, worktree.branch, targetBranch, worktree);
  }

  async openBranchDiff(
    project: Project,
    sourceBranch: string,
    targetBranch: string,
    sourceWorktree?: Worktree,
  ): Promise<DiffSession> {
    if (sourceBranch === targetBranch) {
      throw new Error('Choose two different branches to compare.');
    }
    return this.#openBranchDiff(project, sourceBranch, targetBranch, sourceWorktree);
  }

  async openCommitDiff(project: Project, commitHash: string): Promise<DiffSession> {
    const context = projectCommandContext(project);
    const headSha = (
      await this.#git(
        project.path,
        ['rev-parse', '--verify', `${commitHash}^{commit}`],
        'Resolve commit revision',
        true,
        context,
      )
    ).stdout.trim();
    const [parentsResult, commitResult] = await Promise.all([
      this.#git(
        project.path,
        ['show', '-s', '--format=%P', headSha],
        'Read commit parents',
        true,
        context,
      ),
      this.#git(
        project.path,
        [
          'log',
          '-1',
          '--numstat',
          '--diff-merges=first-parent',
          '--format=%H%n%an%n%ae%n%aI%n%s%n%b%x00',
          headSha,
        ],
        'Read commit details',
        true,
        context,
      ),
    ]);
    const commit = parseCommitDetails(commitResult.stdout);
    if (commit?.hash !== headSha) {
      throw new Error('Could not read the requested commit.');
    }
    const parentShas = parentsResult.stdout.trim().split(/\s+/).filter(Boolean);
    const baseSha =
      parentShas[0] ??
      (
        await this.#git(
          project.path,
          ['hash-object', '-t', 'tree', '/dev/null'],
          'Resolve the empty tree',
          true,
          context,
        )
      ).stdout.trim();
    const contents = await this.#diffContents(
      project.path,
      baseSha,
      headSha,
      'in commit',
      context,
    );
    const id = randomUUID();
    const session: DiffSession = {
      kind: 'commit',
      id,
      projectId: project.id,
      baseSha,
      headSha,
      ...(contents.githubRepository
        ? { githubRepository: contents.githubRepository }
        : {}),
      stats: contents.stats,
      files: contents.files,
      commit: { ...commit, stats: contents.stats },
      parentShas,
    };
    this.#storeDiffSession(id, {
      repositoryPath: project.path,
      context,
      baseSha,
      headSha,
      files: new Map(contents.files.map((file) => [file.id, file])),
    });
    return structuredClone(session);
  }

  async #openBranchDiff(
    project: Project,
    sourceBranch: string,
    targetBranch: string,
    sourceWorktree?: Worktree,
  ): Promise<DiffSession> {
    const context = sourceWorktree
      ? worktreeCommandContext(sourceWorktree)
      : projectCommandContext(project);
    const repositoryPath = sourceWorktree?.path ?? project.path;

    const headSha = (
      await this.#git(
        repositoryPath,
        ['rev-parse', '--verify', `refs/heads/${sourceBranch}`],
        `Resolve ${sourceBranch} revision`,
        true,
        context,
      )
    ).stdout.trim();
    const baseSha = await this.#mergeBase(repositoryPath, targetBranch, headSha, context);
    const contents = await this.#diffContents(
      repositoryPath,
      baseSha,
      headSha,
      `against ${targetBranch}`,
      context,
    );
    const id = randomUUID();
    const session: DiffSession = {
      kind: 'branch',
      id,
      projectId: project.id,
      ...(sourceWorktree ? { sourceWorktreeId: sourceWorktree.id } : {}),
      branch: sourceBranch,
      targetBranch,
      baseSha,
      headSha,
      ...(contents.githubRepository
        ? { githubRepository: contents.githubRepository }
        : {}),
      stats: contents.stats,
      files: contents.files,
    };

    this.#storeDiffSession(id, {
      repositoryPath,
      ...(sourceWorktree ? { editorWorktreePath: sourceWorktree.path } : {}),
      context,
      baseSha,
      headSha,
      files: new Map(contents.files.map((file) => [file.id, file])),
    });
    return structuredClone(session);
  }

  async #diffContents(
    repositoryPath: string,
    baseSha: string,
    headSha: string,
    description: string,
    context: CommandContext,
  ): Promise<{
    files: DiffFileSummary[];
    stats: DiffStats;
    githubRepository?: { owner: string; name: string };
  }> {
    const [nameStatus, numStat, githubRepository] = await Promise.all([
      this.#git(
        repositoryPath,
        ['diff', '--name-status', '-z', '--find-renames', baseSha, headSha],
        `List changes ${description}`,
        true,
        context,
      ),
      this.#git(
        repositoryPath,
        ['diff', '--numstat', '-z', '--find-renames', baseSha, headSha],
        `Read change stats ${description}`,
        true,
        context,
      ),
      this.#githubRepository(repositoryPath, context),
    ]);
    const files = parseDiffFiles(nameStatus.stdout, numStat.stdout);
    return {
      files,
      stats: {
        files: files.length,
        additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
        deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
      },
      ...(githubRepository ? { githubRepository } : {}),
    };
  }

  #storeDiffSession(id: string, session: StoredDiffSession): void {
    this.#diffSessions.set(id, session);
    this.#trimDiffSessions();
  }

  async diffFile(request: DiffFileRequest): Promise<DiffFilePatch> {
    const { file } = this.#diffFile(request);
    if (file.binary) return { fileId: file.id, binary: true, hunks: [] };

    return this.#diffFileReadsLimit(async () => {
      // The session may be closed or evicted while this request is queued,
      // so validate it again before running git diff.
      const current = this.#diffFile(request);
      const paths = [
        ...(current.file.previousPath && current.file.previousPath !== current.file.path
          ? [current.file.previousPath]
          : []),
        current.file.path,
      ];
      const result = await this.#git(
        current.session.repositoryPath,
        [
          'diff',
          '--no-color',
          '--no-ext-diff',
          '--unified=3',
          '--find-renames',
          current.session.baseSha,
          current.session.headSha,
          '--',
          ...paths,
        ],
        `Read diff for ${current.file.path}`,
        true,
        current.session.context,
      );
      return parseUnifiedDiff(current.file.id, result.stdout);
    });
  }

  #diffFile(request: DiffFileRequest): {
    session: StoredDiffSession;
    file: DiffFileSummary;
  } {
    const session = this.#diffSessions.get(request.sessionId);
    if (!session) throw new Error('The diff session expired. Close and reopen it.');
    const file = session.files.get(request.fileId);
    if (!file) throw new Error('The requested file is not part of this diff.');
    return { session, file };
  }

  diffFilePath(request: DiffFileRequest): string {
    const session = this.#diffSessions.get(request.sessionId);
    if (!session) throw new Error('The diff session expired. Close and reopen it.');
    const file = session.files.get(request.fileId);
    if (!file) throw new Error('The requested file is not part of this diff.');
    if (file.status === 'deleted') {
      throw new Error('Deleted files cannot be opened in an editor.');
    }

    if (!session.editorWorktreePath) {
      throw new Error(
        'Check out the source branch in a worktree to open files in an editor.',
      );
    }

    const filePath = path.resolve(session.editorWorktreePath, file.path);
    const relativePath = path.relative(session.editorWorktreePath, filePath);
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

  async #githubRepository(
    worktreePath: string,
    context: CommandContext,
  ): Promise<ReturnType<typeof parseGitHubRepositoryFromRemotes>> {
    const remotes = await this.#gitAllowFailure(
      worktreePath,
      ['remote', '-v'],
      'Find GitHub remote',
      true,
      context,
    );
    return remotes.record.exitCode === 0
      ? parseGitHubRepositoryFromRemotes(remotes.stdout)
      : undefined;
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
