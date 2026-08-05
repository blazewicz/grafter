import path from 'node:path';
import type {
  ApprovalRequest,
  CommitPage,
  CreateWorktreeRequest,
  DiffFilePatch,
  DiffFileRequest,
  DiffSession,
  EditorTool,
  ListBranchCommitsRequest,
  OpenBranchDiffRequest,
  OpenCommitDiffRequest,
  OpenDiffFileRequest,
  Project,
  ProjectConfig,
  PullRequest,
  SetComparisonBaseRequest,
  SwitchBranchRequest,
  Worktree,
  WorktreeComparison,
  WorktreeDetails,
  WorktreeStatus,
} from '../../shared/contracts';
import { expandWorktreeTemplate, worktreePathForBranch } from '../../shared/paths';
import { ApprovalManager } from '../approvals';
import type { ApplicationRuntime } from '../application-runtime';
import type { StateStore } from '../store';
import { GitService } from './git-service';
import { GitHubService } from './github-service';

const pullRequestFreshnessMs = 30_000;

export interface RepositoryServiceOptions {
  onSnapshotUpdate?: (project: Project) => void;
  now?: () => number;
}

export interface RepositoryRefreshOptions {
  tolerateFailure?: boolean;
  hydratePullRequests?: boolean;
  useGlobalRefreshLimit?: boolean;
}

/** Owns all live state and operations for exactly one canonical Git repository. */
export class RepositoryService {
  readonly git: GitService;
  readonly github: GitHubService;
  readonly approvals: ApprovalManager;
  readonly repositoryId: string;
  readonly canonicalRepositoryKey: string;
  readonly #store: StateStore;
  readonly #runtime: ApplicationRuntime;
  readonly #snapshotUpdateSubscribers = new Set<(project: Project) => void>();
  readonly #pullRequestLookups = new Map<string, Promise<PullRequest | undefined>>();
  readonly #pullRequestRefreshedAt = new Map<string, number>();
  readonly #now: () => number;
  #project: Project;
  #refreshVersion = 0;
  #disposed = false;

  constructor(
    project: ProjectConfig,
    canonicalRepositoryKey: string,
    store: StateStore,
    runtime: ApplicationRuntime,
    options: RepositoryServiceOptions = {},
  ) {
    if (!canonicalRepositoryKey) {
      throw new Error('A canonical repository key is required.');
    }
    this.repositoryId = project.id;
    this.canonicalRepositoryKey = canonicalRepositoryKey;
    this.#project = { ...project, worktrees: [] };
    this.#store = store;
    this.#runtime = runtime;
    this.git = new GitService(runtime.commandRunner);
    this.github = new GitHubService(runtime.commandRunner);
    this.approvals = new ApprovalManager(runtime.commandRunner);
    this.#now = options.now ?? Date.now;
    if (options.onSnapshotUpdate) {
      this.#snapshotUpdateSubscribers.add(options.onSnapshotUpdate);
    }
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  snapshot(): Project {
    this.#assertActive();
    const project = this.#persistedProject();
    return structuredClone({ ...project, worktrees: this.#project.worktrees });
  }

  subscribeToSnapshotUpdates(subscriber: (project: Project) => void): () => void {
    this.#assertActive();
    this.#snapshotUpdateSubscribers.add(subscriber);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#snapshotUpdateSubscribers.delete(subscriber);
    };
  }

  async refresh(options: RepositoryRefreshOptions = {}): Promise<Project> {
    this.#assertActive();
    const operation = () =>
      this.#runMutation(() => this.#refresh(options.tolerateFailure ?? false));
    const worktrees = await (options.useGlobalRefreshLimit
      ? this.#runtime.runRepositoryRefresh(operation)
      : operation());
    if (options.hydratePullRequests) {
      this.#startBackgroundTask(
        this.#hydratePullRequests(worktrees),
        'Background pull-request hydration failed.',
      );
    }
    return this.#disposed ? structuredClone(this.#project) : this.snapshot();
  }

  listBranches(): Promise<string[]> {
    this.#assertActive();
    return this.git.listBranches(this.#persistedProject());
  }

  suggestWorktreePath(defaultWorktreePath: string, branch: string): string {
    this.#assertActive();
    const project = this.#persistedProject();
    const root = expandWorktreeTemplate(defaultWorktreePath, project.name, project.path);
    return worktreePathForBranch(root, branch || 'new-worktree');
  }

  async createWorktree(request: CreateWorktreeRequest): Promise<{
    project: Project;
    setupApproval?: ApprovalRequest;
  }> {
    this.#assertProjectId(request.projectId);
    if (!request.branch.trim()) throw new Error('Choose a branch first.');
    if (!path.isAbsolute(request.path)) {
      throw new Error('The worktree path must be absolute.');
    }

    const { project, createdWorktree } = await this.#runMutation(async () => {
      const project = this.#persistedProject();
      await this.git.addWorktree(project, request.path, request.branch);
      const worktrees = await this.#refresh(false);
      const createdWorktree = worktrees.find((item) => item.path === request.path);
      if (!createdWorktree) {
        throw new Error('The new worktree could not be found after creation.');
      }
      this.#startBackgroundTask(
        this.#refreshPullRequest(createdWorktree, true),
        'Background pull-request refresh failed.',
      );
      return { project, createdWorktree };
    });
    const script = await this.git.setupScript(project);
    if (!script) return { project: this.snapshot() };
    return {
      project: this.snapshot(),
      setupApproval: this.approvals.prepare(
        this.git.setupSpec(createdWorktree, script),
        'This project requested a setup script. Review the exact shell command before running it.',
      ),
    };
  }

  async switchBranch(request: SwitchBranchRequest): Promise<Project> {
    const branch = request.branch.trim();
    if (!branch) throw new Error('Choose a branch first.');
    return this.#runMutation(async () => {
      const worktree = this.#worktree(request.worktreeId);
      if (branch === worktree.branch) {
        throw new Error(`${branch} is already checked out in this worktree.`);
      }
      await this.git.switchBranch(worktree, branch);
      const worktrees = await this.#refresh(false);
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
    const project = this.#persistedProject();
    return this.approvals.prepare(
      this.git.removeSpec(project, worktree),
      `This permanently removes the ${worktree.displayName} worktree directory. Dirty worktrees are refused by Git.`,
      async () => {
        await this.#refresh(false);
      },
      (executePreparedCommand) => this.#runMutation(executePreparedCommand),
    );
  }

  async approve(approvalId: string): Promise<Project> {
    this.#assertActive();
    await this.approvals.approve(approvalId);
    return this.snapshot();
  }

  reject(approvalId: string): Project {
    this.#assertActive();
    this.approvals.reject(approvalId);
    return this.snapshot();
  }

  async details(worktreeId: string): Promise<WorktreeDetails> {
    const worktree = this.#worktree(worktreeId);
    return this.git.details(
      this.#persistedProject(),
      worktree,
      this.#comparisonBaseOverride(worktree),
    );
  }

  async setComparisonBase(request: unknown): Promise<WorktreeComparison> {
    if (!isSetComparisonBaseRequest(request)) {
      throw new Error('Invalid comparison base request.');
    }
    this.#worktree(request.worktreeId);
    return this.#runMutation(async () => {
      const worktree = this.#worktree(request.worktreeId);
      const targetBranch = request.targetBranch?.trim();
      if (request.targetBranch !== undefined && !targetBranch) {
        throw new Error('Choose a comparison base.');
      }
      if (targetBranch === worktree.branch) {
        throw new Error('Choose a branch other than the checked-out branch.');
      }
      const project = this.#persistedProject();
      if (targetBranch) {
        const branches = await this.git.listBranches(project);
        if (!branches.includes(targetBranch)) {
          throw new Error('The comparison base is not a local branch.');
        }
      }
      const comparison = await this.git.comparison(project, worktree, targetBranch);
      await this.#store.setComparisonBaseOverride(
        this.repositoryId,
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
      this.#persistedProject(),
      worktree,
      this.#comparisonBaseOverride(worktree),
    );
  }

  async openBranchDiff(request: unknown): Promise<DiffSession> {
    if (!isOpenBranchDiffRequest(request)) {
      throw new Error('Invalid branch comparison request.');
    }
    this.#assertProjectId(request.projectId);
    const sourceBranch = request.sourceBranch.trim();
    const targetBranch = request.targetBranch.trim();
    if (!sourceBranch || !targetBranch) {
      throw new Error('Choose two branches to compare.');
    }
    const sourceWorktree = this.#project.worktrees.find(
      (worktree) => worktree.branch === sourceBranch,
    );
    return this.git.openBranchDiff(
      this.#persistedProject(),
      sourceBranch,
      targetBranch,
      sourceWorktree,
    );
  }

  async openCommitDiff(request: unknown): Promise<DiffSession> {
    if (!isOpenCommitDiffRequest(request)) {
      throw new Error('Invalid commit changes request.');
    }
    this.#assertProjectId(request.projectId);
    return this.git.openCommitDiff(this.#persistedProject(), request.commitHash);
  }

  async diffFile(request: unknown): Promise<DiffFilePatch> {
    if (!isDiffFileRequest(request)) throw new Error('Invalid diff file request.');
    this.#assertActive();
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
    this.#assertActive();
    return {
      editor: request.editor,
      filePath: this.git.diffFilePath(request),
      ...(request.line === undefined ? {} : { line: request.line }),
    };
  }

  closeDiff(sessionId: string): void {
    this.#assertActive();
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

  async updateSetup(script: string): Promise<Project> {
    this.#assertActive();
    await this.#store.setRepositorySetupScript(this.repositoryId, script);
    return this.snapshot();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#refreshVersion += 1;
    this.#snapshotUpdateSubscribers.clear();
    this.#pullRequestLookups.clear();
    this.#pullRequestRefreshedAt.clear();
    this.approvals.dispose();
    this.git.dispose();
    this.#project = { ...this.#project, worktrees: [] };
  }

  async #refresh(tolerateFailure: boolean): Promise<Worktree[]> {
    this.#assertActive();
    const refreshVersion = ++this.#refreshVersion;
    const project = this.#persistedProject();
    const previousWorktrees = new Map(
      this.#project.worktrees.map((worktree) => [worktree.id, worktree] as const),
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
    if (this.#disposed || refreshVersion !== this.#refreshVersion) {
      return this.#project.worktrees;
    }
    if (
      !this.#store.state.projects.some((candidate) => candidate.id === this.repositoryId)
    ) {
      return this.#project.worktrees;
    }
    this.#project = { ...project, worktrees };
    this.#prunePullRequestCache(worktrees);
    return worktrees;
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
    this.#assertActive();
    const lookupKey = pullRequestLookupKey(worktree);
    const refreshedAt = this.#pullRequestRefreshedAt.get(lookupKey);
    if (refreshedAt !== undefined && this.#now() - refreshedAt < pullRequestFreshnessMs) {
      return Promise.resolve(this.#cachedPullRequest(worktree));
    }
    const activeLookup = this.#pullRequestLookups.get(lookupKey);
    if (activeLookup) return activeLookup;

    const startLookup = async (): Promise<PullRequest | undefined> => {
      if (this.#disposed) return undefined;
      return this.github.pullRequest(worktree);
    };
    const lookup = (
      background ? this.#runtime.runBackgroundCommand(startLookup) : startLookup()
    )
      .then((pullRequest) => {
        if (this.#disposed) return undefined;
        this.#pullRequestRefreshedAt.set(lookupKey, this.#now());
        if (!pullRequest) return this.#cachedPullRequest(worktree);
        const current = this.#project.worktrees.find(
          (item) => item.id === worktree.id && item.branch === worktree.branch,
        );
        if (!current) return undefined;
        if (pullRequestsEqual(current.pullRequest, pullRequest)) {
          return structuredClone(pullRequest);
        }
        this.#project = {
          ...this.#project,
          worktrees: this.#project.worktrees.map((item) =>
            item.id === worktree.id && item.branch === worktree.branch
              ? { ...item, pullRequest }
              : item,
          ),
        };
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
    const pullRequest = this.#project.worktrees.find(
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
    const override = this.#store.comparisonBaseOverride(this.repositoryId, worktree.id);
    return override?.sourceBranch === worktree.branch ? override.targetBranch : undefined;
  }

  #worktree(worktreeId: string): Worktree {
    this.#assertActive();
    const worktree = this.#project.worktrees.find((item) => item.id === worktreeId);
    if (!worktree) {
      throw new Error('Worktree not found. Refresh the project and try again.');
    }
    return worktree;
  }

  #persistedProject(): ProjectConfig {
    this.#assertActive();
    const project = this.#store.state.projects.find(
      (candidate) => candidate.id === this.repositoryId,
    );
    if (!project) throw new Error('Project not found.');
    return project;
  }

  #assertProjectId(projectId: string): void {
    this.#assertActive();
    if (projectId !== this.repositoryId) throw new Error('Project not found.');
  }

  #runMutation<T>(operation: () => Promise<T>): Promise<T> {
    return this.#runtime.runRepositoryMutation(this.canonicalRepositoryKey, async () => {
      this.#assertActive();
      return operation();
    });
  }

  #startBackgroundTask(task: Promise<unknown>, message: string): void {
    this.#runtime.observeBackgroundTask(() => task, message);
  }

  #publishSnapshotUpdate(): void {
    if (this.#disposed) return;
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

  #assertActive(): void {
    if (this.#disposed) throw new Error('The repository service is disposed.');
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
