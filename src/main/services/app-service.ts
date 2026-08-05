import path from 'node:path';
import os from 'node:os';
import { isCommandContext } from '../../shared/command-context';
import type {
  AppSnapshot,
  ApprovalRequest,
  CommitPage,
  CommandRecord,
  CreateWorktreeRequest,
  DiffFilePatch,
  DiffFileRequest,
  EditorTool,
  OpenBranchDiffRequest,
  OpenCommitDiffRequest,
  OpenDiffFileRequest,
  DiffSession,
  ListBranchCommitsRequest,
  Project,
  ProjectConfig,
  PullRequest,
  Settings,
  SetComparisonBaseRequest,
  SwitchBranchRequest,
  Worktree,
  WorktreeComparison,
  WorktreeDetails,
  WorktreeStatus,
} from '../../shared/contracts';
import { expandWorktreeTemplate, worktreePathForBranch } from '../../shared/paths';
import { isSettings } from '../../shared/settings';
import { ApprovalManager } from '../approvals';
import type { ApplicationRuntime } from '../application-runtime';
import { GitService } from './git-service';
import { GitHubService } from './github-service';
import { RepositoryLocator } from './repository-locator';
import type { StateStore } from '../store';

const pullRequestFreshnessMs = 30_000;

interface AppServiceOptions {
  homeDirectory?: string;
  systemLocale?: string;
  onSnapshotUpdate?: (snapshot: AppSnapshot) => void;
  now?: () => number;
}

export class AppService {
  readonly git: GitService;
  readonly github: GitHubService;
  readonly repositoryLocator: RepositoryLocator;
  readonly approvals: ApprovalManager;
  #trees: Project[] = [];
  readonly #snapshotUpdateSubscribers = new Set<(snapshot: AppSnapshot) => void>();
  readonly #now: () => number;
  readonly #homeDirectory: string;
  readonly #systemLocale: string;
  readonly #pullRequestLookups = new Map<string, Promise<PullRequest | undefined>>();
  readonly #pullRequestRefreshedAt = new Map<string, number>();
  readonly #projectRefreshVersions = new Map<string, number>();

  constructor(
    readonly store: StateStore,
    readonly runtime: ApplicationRuntime,
    options: AppServiceOptions = {},
  ) {
    const runner = runtime.commandRunner;
    this.git = new GitService(runner);
    this.github = new GitHubService(runner);
    this.repositoryLocator = new RepositoryLocator(runner);
    this.approvals = new ApprovalManager(runner);
    this.#homeDirectory = options.homeDirectory ?? os.homedir();
    this.#systemLocale =
      options.systemLocale ?? Intl.DateTimeFormat().resolvedOptions().locale;
    if (options.onSnapshotUpdate) {
      this.#snapshotUpdateSubscribers.add(options.onSnapshotUpdate);
    }
    this.#now = options.now ?? Date.now;
  }

  get runner() {
    return this.runtime.commandRunner;
  }

  async initialize(): Promise<void> {
    await this.store.load();
    await this.refresh();
  }

  snapshot(): AppSnapshot {
    const persisted = this.store.state;
    return {
      homeDirectory: this.#homeDirectory,
      systemLocale: this.#systemLocale,
      projects: structuredClone(this.#trees),
      recentRepositories: persisted.recentRepositories,
      settings: persisted.settings,
    };
  }

  subscribeToSnapshotUpdates(subscriber: (snapshot: AppSnapshot) => void): () => void {
    this.#snapshotUpdateSubscribers.add(subscriber);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#snapshotUpdateSubscribers.delete(subscriber);
    };
  }

  #publishSnapshotUpdate(): void {
    let firstError: unknown;
    for (const subscriber of this.#snapshotUpdateSubscribers) {
      try {
        subscriber(this.snapshot());
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError instanceof Error) throw firstError;
    if (firstError !== undefined) {
      throw new Error('Snapshot subscriber failed.', { cause: firstError });
    }
  }

  commandLog(context: unknown): CommandRecord[] {
    if (!isCommandContext(context)) throw new Error('Invalid command log context.');
    return this.runner.recordsFor(context);
  }

  async addProject(selectedPath: string): Promise<AppSnapshot> {
    const location = await this.repositoryLocator.locate(selectedPath);
    const details: Omit<ProjectConfig, 'id'> = {
      name: location.name,
      path: location.mainWorktreePath,
    };
    const persisted = this.store.state;
    const existingRecent = persisted.recentRepositories.find(
      (repository) =>
        repository.commonDirectoryPath === location.commonDirectoryPath ||
        repository.mainWorktreePath === details.path,
    );
    const existing = persisted.projects.find(
      (project) =>
        project.id === existingRecent?.repositoryId || project.path === details.path,
    );
    if (existing) {
      await this.store.openRepository(
        existing.id,
        location.selectedWorktreePath,
        location.commonDirectoryPath,
      );
      this.#reconcileProjectTrees();
      return this.snapshot();
    }

    const project = this.git.createProject(details);
    await this.store.addRepository(
      project,
      location.selectedWorktreePath,
      location.commonDirectoryPath,
    );
    this.#reconcileProjectTrees();
    const worktrees = await this.#runProjectOperationSerialized(project.id, () =>
      this.#refreshProject(project, false),
    );
    this.#prunePullRequestCache(this.#trees.flatMap((item) => item.worktrees));
    this.#startBackgroundTask(
      this.#hydratePullRequests(worktrees),
      'Background pull-request hydration failed.',
    );
    return this.snapshot();
  }

  async openRecentRepository(repositoryId: string): Promise<AppSnapshot> {
    const repository = this.store.state.recentRepositories.find(
      (candidate) => candidate.repositoryId === repositoryId,
    );
    if (!repository) throw new Error('Recent repository not found.');
    return this.addProject(repository.lastOpenedPath);
  }

  async removeProject(projectId: string): Promise<AppSnapshot> {
    await this.store.removeRepository(projectId);
    this.#projectRefreshVersions.delete(projectId);
    this.#reconcileProjectTrees();
    this.#prunePullRequestCache(this.#trees.flatMap((item) => item.worktrees));
    return this.snapshot();
  }

  async refresh(): Promise<AppSnapshot> {
    this.#reconcileProjectTrees();
    await Promise.all(
      this.store.state.projects.map((project) =>
        this.#runProjectOperationSerialized(project.id, () =>
          this.runtime.runRepositoryRefresh(() => this.#refreshProject(project, true)),
        ),
      ),
    );
    const worktrees = this.#trees.flatMap((project) => project.worktrees);
    this.#prunePullRequestCache(worktrees);
    this.#startBackgroundTask(
      this.#hydratePullRequests(worktrees),
      'Background pull-request hydration failed.',
    );
    return this.snapshot();
  }

  async refreshProject(projectId: string): Promise<AppSnapshot> {
    const project = this.#project(projectId);
    await this.#runProjectOperationSerialized(project.id, () =>
      this.#refreshProject(project, false),
    );
    this.#prunePullRequestCache(this.#trees.flatMap((item) => item.worktrees));
    return this.snapshot();
  }

  async listBranches(projectId: string): Promise<string[]> {
    return this.git.listBranches(this.#project(projectId));
  }

  suggestWorktreePath(projectId: string, branch: string): string {
    const project = this.#project(projectId);
    const root = expandWorktreeTemplate(
      this.store.state.settings.defaultWorktreePath,
      project.name,
      project.path,
    );
    return worktreePathForBranch(root, branch || 'new-worktree');
  }

  async createWorktree(request: CreateWorktreeRequest): Promise<{
    snapshot: AppSnapshot;
    setupApproval?: ApprovalRequest;
  }> {
    if (!request.branch.trim()) throw new Error('Choose a branch first.');
    if (!path.isAbsolute(request.path))
      throw new Error('The worktree path must be absolute.');

    const { project, createdWorktree } = await this.#runProjectOperationSerialized(
      request.projectId,
      async () => {
        const project = this.#project(request.projectId);
        await this.git.addWorktree(project, request.path, request.branch);
        await this.#refreshProject(project, false);
        this.#prunePullRequestCache(this.#trees.flatMap((item) => item.worktrees));
        const createdWorktree = this.#trees
          .find((item) => item.id === project.id)
          ?.worktrees.find((item) => item.path === request.path);
        if (!createdWorktree) {
          throw new Error('The new worktree could not be found after creation.');
        }
        this.#startBackgroundTask(
          this.#refreshPullRequest(createdWorktree, true),
          'Background pull-request refresh failed.',
        );
        return { project, createdWorktree };
      },
    );
    const script = await this.git.setupScript(project);
    const snapshot = this.snapshot();
    if (!script) return { snapshot };
    const setupApproval = this.approvals.prepare(
      this.git.setupSpec(createdWorktree, script),
      'This project requested a setup script. Review the exact shell command before running it.',
    );
    return { snapshot: this.snapshot(), setupApproval };
  }

  async switchBranch(request: SwitchBranchRequest): Promise<AppSnapshot> {
    const branch = request.branch.trim();
    if (!branch) throw new Error('Choose a branch first.');
    const projectId = this.#worktree(request.worktreeId).projectId;
    return this.#runProjectOperationSerialized(projectId, async () => {
      const worktree = this.#worktree(request.worktreeId);
      if (branch === worktree.branch) {
        throw new Error(`${branch} is already checked out in this worktree.`);
      }

      const project = this.#project(worktree.projectId);
      await this.git.switchBranch(worktree, branch);
      const worktrees = await this.#refreshProject(project, false);
      this.#prunePullRequestCache(this.#trees.flatMap((item) => item.worktrees));

      const switched = worktrees.find((item) => item.id === worktree.id);
      if (switched?.branch !== branch) {
        throw new Error('The worktree branch could not be confirmed after switching.');
      }
      this.#startBackgroundTask(
        this.#refreshPullRequest(switched),
        'Background pull-request refresh failed.',
      );
      return this.snapshot();
    });
  }

  prepareRemove(worktreeId: string): ApprovalRequest {
    const worktree = this.#worktree(worktreeId);
    if (worktree.isMain) throw new Error('Grafter never removes a project’s main clone.');
    if (worktree.locked) throw new Error('Unlock this worktree before removing it.');
    const project = this.#project(worktree.projectId);
    return this.approvals.prepare(
      this.git.removeSpec(project, worktree),
      `This permanently removes the ${worktree.displayName} worktree directory. Dirty worktrees are refused by Git.`,
      async () => {
        await this.#refreshProject(project, false);
        this.#prunePullRequestCache(this.#trees.flatMap((item) => item.worktrees));
      },
      (executePreparedCommand) =>
        this.#runProjectOperationSerialized(project.id, executePreparedCommand),
    );
  }

  async approve(approvalId: string): Promise<AppSnapshot> {
    await this.approvals.approve(approvalId);
    return this.snapshot();
  }

  reject(approvalId: string): AppSnapshot {
    this.approvals.reject(approvalId);
    return this.snapshot();
  }

  async details(worktreeId: string): Promise<WorktreeDetails> {
    const worktree = this.#worktree(worktreeId);
    return this.git.details(
      this.#project(worktree.projectId),
      worktree,
      this.#comparisonBaseOverride(worktree),
    );
  }

  async setComparisonBase(request: unknown): Promise<WorktreeComparison> {
    if (!isSetComparisonBaseRequest(request)) {
      throw new Error('Invalid comparison base request.');
    }
    const projectId = this.#worktree(request.worktreeId).projectId;
    return this.#runProjectOperationSerialized(projectId, async () => {
      const worktree = this.#worktree(request.worktreeId);
      const targetBranch = request.targetBranch?.trim();
      if (request.targetBranch !== undefined && !targetBranch) {
        throw new Error('Choose a comparison base.');
      }
      if (targetBranch === worktree.branch) {
        throw new Error('Choose a branch other than the checked-out branch.');
      }
      const project = this.#project(worktree.projectId);
      if (targetBranch) {
        const branches = await this.git.listBranches(project);
        if (!branches.includes(targetBranch)) {
          throw new Error('The comparison base is not a local branch.');
        }
      }
      const comparison = await this.git.comparison(project, worktree, targetBranch);
      await this.store.setComparisonBaseOverride(
        project.id,
        worktree.id,
        targetBranch ? { sourceBranch: worktree.branch, targetBranch } : undefined,
      );
      return comparison;
    });
  }

  async listBranchCommits(request: unknown): Promise<CommitPage> {
    if (!isListBranchCommitsRequest(request)) {
      throw new Error('Invalid branch commit request.');
    }
    const worktree = this.#worktree(request.worktreeId);
    return this.git.branchCommits(
      worktree,
      request.targetBranch.trim(),
      request.offset,
      request.limit,
    );
  }

  async openDiff(worktreeId: string): Promise<DiffSession> {
    const worktree = this.#worktree(worktreeId);
    return this.git.openDiff(
      this.#project(worktree.projectId),
      worktree,
      this.#comparisonBaseOverride(worktree),
    );
  }

  async openBranchDiff(request: unknown): Promise<DiffSession> {
    if (!isOpenBranchDiffRequest(request)) {
      throw new Error('Invalid branch comparison request.');
    }
    const sourceBranch = request.sourceBranch.trim();
    const targetBranch = request.targetBranch.trim();
    if (!sourceBranch || !targetBranch) {
      throw new Error('Choose two branches to compare.');
    }
    const project = this.#project(request.projectId);
    const sourceWorktree = this.#trees
      .find((item) => item.id === project.id)
      ?.worktrees.find((worktree) => worktree.branch === sourceBranch);
    return this.git.openBranchDiff(project, sourceBranch, targetBranch, sourceWorktree);
  }

  async openCommitDiff(request: unknown): Promise<DiffSession> {
    if (!isOpenCommitDiffRequest(request)) {
      throw new Error('Invalid commit changes request.');
    }
    return this.git.openCommitDiff(this.#project(request.projectId), request.commitHash);
  }

  async diffFile(request: unknown): Promise<DiffFilePatch> {
    if (!isDiffFileRequest(request)) throw new Error('Invalid diff file request.');
    return this.git.diffFile(request);
  }

  diffFileEditorTarget(request: unknown): {
    editor: EditorTool;
    filePath: string;
    line?: number;
  } {
    if (!isOpenDiffFileRequest(request)) {
      throw new Error('Invalid open diff file request.');
    }
    return {
      editor: request.editor,
      filePath: this.git.diffFilePath(request),
      ...(request.line === undefined ? {} : { line: request.line }),
    };
  }

  closeDiff(sessionId: string): void {
    if (typeof sessionId !== 'string') throw new Error('Invalid diff session.');
    this.git.closeDiff(sessionId);
  }

  async refreshPullRequest(worktreeId: string): Promise<PullRequest | undefined> {
    return this.#refreshPullRequest(this.#worktree(worktreeId));
  }

  async worktreeStatus(worktreeId: string): Promise<WorktreeStatus> {
    return this.git.status(this.#worktree(worktreeId));
  }

  worktreePath(worktreeId: string): string {
    return this.#worktree(worktreeId).path;
  }

  async updateSettings(settings: Settings): Promise<AppSnapshot> {
    if (!isSettings(settings)) throw new Error('Invalid settings.');
    if (!settings.defaultWorktreePath.trim())
      throw new Error('The default path cannot be empty.');
    await this.store.update((state) => {
      state.settings = {
        ...settings,
        defaultWorktreePath: settings.defaultWorktreePath.trim(),
      };
    });
    return this.snapshot();
  }

  async updateProjectSetup(projectId: string, script: string): Promise<AppSnapshot> {
    await this.store.setRepositorySetupScript(projectId, script);
    this.#reconcileProjectTrees();
    return this.snapshot();
  }

  #reconcileProjectTrees(): void {
    const previousTrees = new Map(this.#trees.map((project) => [project.id, project]));
    this.#trees = this.store.state.projects.map((project) => ({
      ...project,
      worktrees: previousTrees.get(project.id)?.worktrees ?? [],
    }));
  }

  #runProjectOperationSerialized<T>(
    projectId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.runtime.runRepositoryMutation(
      this.#repositoryRuntimeKey(projectId),
      operation,
    );
  }

  #startBackgroundTask(task: Promise<unknown>, message: string): void {
    this.runtime.observeBackgroundTask(() => task, message);
  }

  #repositoryRuntimeKey(projectId: string): string {
    const persisted = this.store.state;
    const repository = persisted.recentRepositories.find(
      (candidate) => candidate.repositoryId === projectId,
    );
    if (repository?.commonDirectoryPath) return repository.commonDirectoryPath;
    const project = persisted.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new Error('Project not found.');
    // Legacy projects predate canonical common-directory persistence. Their canonicalized
    // main-worktree path is the compatibility key until work unit 6 opens a scoped service
    // from a RepositoryLocation and always supplies the common directory.
    return project.path;
  }

  async #refreshProject(
    project: ProjectConfig,
    tolerateFailure: boolean,
  ): Promise<Worktree[]> {
    const refreshVersion = (this.#projectRefreshVersions.get(project.id) ?? 0) + 1;
    this.#projectRefreshVersions.set(project.id, refreshVersion);
    const previousWorktrees = new Map(
      this.#trees
        .find((item) => item.id === project.id)
        ?.worktrees.map((worktree) => [worktree.id, worktree] as const) ?? [],
    );
    let worktrees: Worktree[];
    try {
      worktrees = (await this.git.listWorktrees(project)).map((worktree) => {
        const previous = previousWorktrees.get(worktree.id);
        return previous?.branch === worktree.branch && previous.pullRequest
          ? { ...worktree, pullRequest: previous.pullRequest }
          : worktree;
      });
    } catch (error) {
      if (!tolerateFailure) throw error;
      worktrees = [...previousWorktrees.values()];
    }

    const currentWorktrees =
      this.#trees.find((item) => item.id === project.id)?.worktrees ?? [];
    const currentProject = this.store.state.projects.find(
      (item) => item.id === project.id,
    );
    if (
      !currentProject ||
      this.#projectRefreshVersions.get(project.id) !== refreshVersion
    ) {
      return currentWorktrees;
    }

    const nextTree = { ...currentProject, worktrees };
    const existingIndex = this.#trees.findIndex((item) => item.id === project.id);
    if (existingIndex === -1) {
      this.#trees = [...this.#trees, nextTree];
    } else {
      this.#trees = this.#trees.map((item, index) =>
        index === existingIndex ? nextTree : item,
      );
    }
    return worktrees;
  }

  #project(projectId: string): ProjectConfig {
    const project = this.store.state.projects.find((item) => item.id === projectId);
    if (!project) throw new Error('Project not found.');
    return project;
  }

  #worktree(worktreeId: string): Worktree {
    const worktree = this.#trees
      .flatMap((project) => project.worktrees)
      .find((item) => item.id === worktreeId);
    if (!worktree)
      throw new Error('Worktree not found. Refresh the project and try again.');
    return worktree;
  }

  async #hydratePullRequests(worktrees: readonly Worktree[]): Promise<void> {
    await Promise.all(
      worktrees.map((worktree) => this.#refreshPullRequest(worktree, true)),
    );
  }

  #refreshPullRequest(
    worktree: Worktree,
    background = false,
  ): Promise<PullRequest | undefined> {
    const lookupKey = pullRequestLookupKey(worktree);
    const refreshedAt = this.#pullRequestRefreshedAt.get(lookupKey);
    if (refreshedAt !== undefined && this.#now() - refreshedAt < pullRequestFreshnessMs) {
      return Promise.resolve(this.#cachedPullRequest(worktree));
    }

    const activeLookup = this.#pullRequestLookups.get(lookupKey);
    if (activeLookup) return activeLookup;

    const startLookup = (): Promise<PullRequest | undefined> =>
      this.github.pullRequest(worktree);
    const lookup = (
      background ? this.runtime.runBackgroundCommand(startLookup) : startLookup()
    )
      .then((pullRequest) => {
        this.#pullRequestRefreshedAt.set(lookupKey, this.#now());
        if (!pullRequest) return this.#cachedPullRequest(worktree);

        const current = this.#trees
          .flatMap((project) => project.worktrees)
          .find((item) => item.id === worktree.id && item.branch === worktree.branch);
        if (!current) return undefined;
        if (pullRequestsEqual(current.pullRequest, pullRequest)) {
          return structuredClone(pullRequest);
        }

        this.#trees = this.#trees.map((project) => ({
          ...project,
          worktrees: project.worktrees.map((item) =>
            item.id === worktree.id && item.branch === worktree.branch
              ? { ...item, pullRequest }
              : item,
          ),
        }));
        this.#publishSnapshotUpdate();
        return structuredClone(pullRequest);
      })
      .finally(() => {
        if (this.#pullRequestLookups.get(lookupKey) === lookup) {
          this.#pullRequestLookups.delete(lookupKey);
        }
      });
    this.#pullRequestLookups.set(lookupKey, lookup);
    return lookup;
  }

  #cachedPullRequest(worktree: Worktree): PullRequest | undefined {
    const pullRequest = this.#trees
      .flatMap((project) => project.worktrees)
      .find(
        (item) => item.id === worktree.id && item.branch === worktree.branch,
      )?.pullRequest;
    return pullRequest ? structuredClone(pullRequest) : undefined;
  }

  #prunePullRequestCache(worktrees: readonly Worktree[]): void {
    const currentKeys = new Set(worktrees.map(pullRequestLookupKey));
    for (const key of this.#pullRequestRefreshedAt.keys()) {
      if (!currentKeys.has(key)) this.#pullRequestRefreshedAt.delete(key);
    }
  }

  #comparisonBaseOverride(worktree: Worktree): string | undefined {
    const override = this.store.comparisonBaseOverride(worktree.projectId, worktree.id);
    return override?.sourceBranch === worktree.branch ? override.targetBranch : undefined;
  }
}

function pullRequestLookupKey(worktree: Pick<Worktree, 'id' | 'branch'>): string {
  return `${worktree.id}\0${worktree.branch}`;
}

function isDiffFileRequest(value: unknown): value is DiffFileRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return typeof request.sessionId === 'string' && typeof request.fileId === 'string';
}

function isOpenBranchDiffRequest(value: unknown): value is OpenBranchDiffRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.projectId === 'string' &&
    typeof request.sourceBranch === 'string' &&
    typeof request.targetBranch === 'string'
  );
}

function isSetComparisonBaseRequest(value: unknown): value is SetComparisonBaseRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.worktreeId === 'string' &&
    (request.targetBranch === undefined || typeof request.targetBranch === 'string')
  );
}

function isListBranchCommitsRequest(value: unknown): value is ListBranchCommitsRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.worktreeId === 'string' &&
    typeof request.targetBranch === 'string' &&
    Boolean(request.targetBranch.trim()) &&
    typeof request.offset === 'number' &&
    Number.isSafeInteger(request.offset) &&
    request.offset >= 0 &&
    typeof request.limit === 'number' &&
    Number.isSafeInteger(request.limit) &&
    request.limit >= 1 &&
    request.limit <= 50
  );
}

function isOpenCommitDiffRequest(value: unknown): value is OpenCommitDiffRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.projectId === 'string' &&
    typeof request.commitHash === 'string' &&
    /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(request.commitHash)
  );
}

function isOpenDiffFileRequest(value: unknown): value is OpenDiffFileRequest {
  return (
    isDiffFileRequest(value) &&
    'editor' in value &&
    value.editor === 'vscode' &&
    (!('line' in value) ||
      value.line === undefined ||
      (typeof value.line === 'number' &&
        Number.isSafeInteger(value.line) &&
        value.line > 0))
  );
}

function pullRequestsEqual(left: PullRequest | undefined, right: PullRequest): boolean {
  return (
    left?.number === right.number &&
    left.title === right.title &&
    left.url === right.url &&
    left.state === right.state &&
    left.baseBranch === right.baseBranch
  );
}
