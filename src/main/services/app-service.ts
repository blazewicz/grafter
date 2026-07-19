import path from 'node:path';
import os from 'node:os';
import pMap from 'p-map';
import { isCommandContext } from '../../shared/command-context';
import type {
  AppSnapshot,
  ApprovalRequest,
  CommandRecord,
  CreateWorktreeRequest,
  Project,
  ProjectTreeItem,
  PullRequest,
  Settings,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../../shared/contracts';
import { expandWorktreeTemplate, worktreePathForBranch } from '../../shared/paths';
import { isSettings } from '../../shared/settings';
import { ApprovalManager } from '../approvals';
import type { CommandRunner } from '../commands';
import { GitService } from './git-service';
import { GitHubService } from './github-service';
import type { StateStore } from '../store';

const pullRequestLookupConcurrency = 5;
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
  readonly approvals: ApprovalManager;
  #trees: ProjectTreeItem[] = [];
  readonly #onSnapshotUpdate: (snapshot: AppSnapshot) => void;
  readonly #now: () => number;
  readonly #homeDirectory: string;
  readonly #systemLocale: string;
  readonly #pullRequestLookups = new Map<string, Promise<PullRequest | undefined>>();
  readonly #pullRequestRefreshedAt = new Map<string, number>();

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
    if (!this.store.state.projects.some((project) => project.path === details.path)) {
      await this.store.update((state) =>
        state.projects.push(this.git.createProject(details)),
      );
    }
    return this.refresh();
  }

  async removeProject(projectId: string): Promise<AppSnapshot> {
    await this.store.update((state) => {
      state.projects = state.projects.filter((project) => project.id !== projectId);
    });
    return this.refresh();
  }

  async refresh(): Promise<AppSnapshot> {
    const previousWorktrees = new Map(
      this.#trees.flatMap((project) =>
        project.worktrees.map((worktree) => [worktree.id, worktree] as const),
      ),
    );
    const trees: ProjectTreeItem[] = [];
    for (const project of this.store.state.projects) {
      try {
        const worktrees = await this.git.listWorktrees(project);
        trees.push({
          ...project,
          worktrees: worktrees.map((worktree) => {
            const previous = previousWorktrees.get(worktree.id);
            return previous?.branch === worktree.branch && previous.pullRequest
              ? { ...worktree, pullRequest: previous.pullRequest }
              : worktree;
          }),
        });
      } catch {
        trees.push({ ...project, worktrees: [] });
      }
    }
    this.#trees = trees;
    const worktrees = trees.flatMap((project) => project.worktrees);
    this.#prunePullRequestCache(worktrees);
    void this.#hydratePullRequests(worktrees).catch(() => undefined);
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
    const project = this.#project(request.projectId);
    if (!request.branch.trim()) throw new Error('Choose a branch first.');
    if (!path.isAbsolute(request.path))
      throw new Error('The worktree path must be absolute.');
    await this.git.addWorktree(project, request.path, request.branch);
    const snapshot = await this.refresh();
    const script = await this.git.setupScript(project);
    if (!script) return { snapshot };
    const createdWorktree = this.#trees
      .find((item) => item.id === project.id)
      ?.worktrees.find((item) => item.path === request.path);
    if (!createdWorktree) {
      throw new Error('The new worktree could not be found after creation.');
    }
    const setupApproval = this.approvals.prepare(
      this.git.setupSpec(createdWorktree, script),
      'This project requested a setup script. Review the exact shell command before running it.',
    );
    return { snapshot: this.snapshot(), setupApproval };
  }

  prepareRemove(worktreeId: string): ApprovalRequest {
    const worktree = this.#worktree(worktreeId);
    if (worktree.isMain) throw new Error('Grafter never removes a project’s main clone.');
    if (worktree.locked) throw new Error('Unlock this worktree before removing it.');
    const project = this.#project(worktree.projectId);
    return this.approvals.prepare(
      this.git.removeSpec(project, worktree),
      `This permanently removes the ${worktree.branch} worktree directory. Dirty worktrees are refused by Git.`,
      async () => {
        await this.git.listWorktrees(project);
      },
    );
  }

  async approve(approvalId: string): Promise<AppSnapshot> {
    await this.approvals.approve(approvalId);
    return this.refresh();
  }

  reject(approvalId: string): AppSnapshot {
    this.approvals.reject(approvalId);
    return this.snapshot();
  }

  async details(worktreeId: string): Promise<WorktreeDetails> {
    const worktree = this.#worktree(worktreeId);
    return this.git.details(this.#project(worktree.projectId), worktree);
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
    return this.refresh();
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
    await pMap(worktrees, (worktree) => this.#refreshPullRequest(worktree), {
      concurrency: pullRequestLookupConcurrency,
    });
  }

  #refreshPullRequest(worktree: Worktree): Promise<PullRequest | undefined> {
    const lookupKey = pullRequestLookupKey(worktree);
    const refreshedAt = this.#pullRequestRefreshedAt.get(lookupKey);
    if (refreshedAt !== undefined && this.#now() - refreshedAt < pullRequestFreshnessMs) {
      return Promise.resolve(this.#cachedPullRequest(worktree));
    }

    const activeLookup = this.#pullRequestLookups.get(lookupKey);
    if (activeLookup) return activeLookup;

    const lookup = this.github
      .pullRequest(worktree)
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
}

function pullRequestLookupKey(worktree: Pick<Worktree, 'id' | 'branch'>): string {
  return `${worktree.id}\0${worktree.branch}`;
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
