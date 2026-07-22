import path from 'node:path';
import os from 'node:os';
import pLimit from 'p-limit';
import { isCommandContext } from '../../shared/command-context';
import type {
  AppSnapshot,
  ApprovalRequest,
  CommandRecord,
  CreateWorktreeRequest,
  DiffFilePatch,
  DiffFileRequest,
  EditorTool,
  OpenBranchDiffRequest,
  OpenCommitDiffRequest,
  OpenDiffFileRequest,
  DiffSession,
  Project,
  ProjectTreeItem,
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
import { CommandRunner } from '../commands';
import { GitService } from './git-service';
import { GitHubService } from './github-service';
import type { StateStore } from '../store';

const pullRequestFreshnessMs = 30_000;

interface AppServiceOptions {
  homeDirectory?: string;
  systemLocale?: string;
  onSnapshotUpdate?: (snapshot: AppSnapshot) => void;
  now?: () => number;
  onBackgroundError?: (message: string, error: unknown) => void;
}

export class AppService {
  // Bulk workflows won't use CommandRunner's full aggregate capacity, so
  // unrelated interactive commands retain room to start.
  static readonly maximumConcurrentProjectRefreshes = Math.max(
    1,
    Math.floor(CommandRunner.maximumConcurrentCommands / 2),
  );
  static readonly maximumConcurrentBackgroundPullRequestLookups = Math.max(
    1,
    Math.floor(CommandRunner.maximumConcurrentCommands / 2),
  );

  readonly git: GitService;
  readonly github: GitHubService;
  readonly approvals: ApprovalManager;
  #trees: ProjectTreeItem[] = [];
  readonly #onSnapshotUpdate: (snapshot: AppSnapshot) => void;
  readonly #now: () => number;
  readonly #onBackgroundError: (message: string, error: unknown) => void;
  readonly #homeDirectory: string;
  readonly #systemLocale: string;
  readonly #pullRequestLookups = new Map<string, Promise<PullRequest | undefined>>();
  readonly #backgroundPullRequestLookupsLimit = pLimit(
    AppService.maximumConcurrentBackgroundPullRequestLookups,
  );
  readonly #projectRefreshLimit = pLimit(AppService.maximumConcurrentProjectRefreshes);
  readonly #projectOperationLimits = new Map<string, ReturnType<typeof pLimit>>();
  readonly #pullRequestRefreshedAt = new Map<string, number>();
  readonly #projectRefreshVersions = new Map<string, number>();

  constructor(
    readonly store: StateStore,
    readonly runner: CommandRunner,
    options: AppServiceOptions = {},
  ) {
    this.git = new GitService(runner);
    this.github = new GitHubService(runner);
    this.approvals = new ApprovalManager(runner);
    this.#homeDirectory = options.homeDirectory ?? os.homedir();
    this.#systemLocale =
      options.systemLocale ?? Intl.DateTimeFormat().resolvedOptions().locale;
    this.#onSnapshotUpdate = options.onSnapshotUpdate ?? (() => undefined);
    this.#now = options.now ?? Date.now;
    this.#onBackgroundError =
      options.onBackgroundError ?? ((message, error) => console.error(message, error));
  }

  async initialize(): Promise<void> {
    await this.store.load();
    await this.refresh();
  }

  snapshot(): AppSnapshot {
    return {
      homeDirectory: this.#homeDirectory,
      systemLocale: this.#systemLocale,
      projects: structuredClone(this.#trees),
      settings: this.store.state.settings,
    };
  }

  commandLog(context: unknown): CommandRecord[] {
    if (!isCommandContext(context)) throw new Error('Invalid command log context.');
    return this.runner.recordsFor(context);
  }

  async addProject(selectedPath: string): Promise<AppSnapshot> {
    const details = await this.git.inspectMainClone(selectedPath);
    const existing = this.store.state.projects.find(
      (project) => project.path === details.path,
    );
    if (existing) {
      this.#reconcileProjectTrees();
      return this.snapshot();
    }

    const project = this.git.createProject(details);
    await this.store.update((state) => state.projects.push(project));
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

  async removeProject(projectId: string): Promise<AppSnapshot> {
    await this.store.update((state) => {
      state.projects = state.projects.filter((project) => project.id !== projectId);
    });
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
          this.#projectRefreshLimit(() => this.#refreshProject(project, true)),
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
      await this.store.update((state) => {
        if (targetBranch) {
          state.comparisonBaseOverrides[worktree.id] = {
            sourceBranch: worktree.branch,
            targetBranch,
          };
        } else {
          delete state.comparisonBaseOverrides[worktree.id];
        }
      });
      return comparison;
    });
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
    await this.store.update((state) => {
      const project = state.projects.find((item) => item.id === projectId);
      if (!project) throw new Error('Project not found.');
      if (script.trim()) project.setupScript = script.trim();
      else delete project.setupScript;
    });
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
    let limit = this.#projectOperationLimits.get(projectId);
    if (!limit) {
      limit = pLimit(1);
      this.#projectOperationLimits.set(projectId, limit);
    }
    return limit(operation);
  }

  #startBackgroundTask(task: Promise<unknown>, message: string): void {
    void task.catch((error: unknown) => this.#onBackgroundError(message, error));
  }

  async #refreshProject(project: Project, tolerateFailure: boolean): Promise<Worktree[]> {
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

  #project(projectId: string): Project {
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
      background ? this.#backgroundPullRequestLookupsLimit(startLookup) : startLookup()
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
        this.#onSnapshotUpdate(this.snapshot());
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
    const override = this.store.state.comparisonBaseOverrides[worktree.id];
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
