import os from 'node:os';
import { isCommandContext } from '../../shared/command-context';
import type {
  ApprovalRequest,
  CommandRecord,
  CreateWorktreeRequest,
  DiffFilePatch,
  DiffSession,
  EditorTool,
  Project,
  ProjectConfig,
  PullRequest,
  RecentRepository,
  Settings,
  SwitchBranchRequest,
  WorktreeComparison,
  WorktreeDetails,
  WorktreeStatus,
} from '../../shared/contracts';
import { isSettings } from '../../shared/settings';
import { ApprovalManager } from '../approvals';
import type { ApplicationRuntime } from '../application-runtime';
import type { StateStore } from '../store';
import { GitService } from './git-service';
import { GitHubService } from './github-service';
import { RepositoryLocator } from './repository-locator';
import { RepositoryService } from './repository-service';

export interface LegacyAppSnapshot {
  homeDirectory: string;
  systemLocale: string;
  projects: Project[];
  recentRepositories: RecentRepository[];
  settings: Settings;
}

interface LegacyCreateWorktreeRequest extends CreateWorktreeRequest {
  projectId: string;
}

interface AppServiceOptions {
  homeDirectory?: string;
  systemLocale?: string;
  onSnapshotUpdate?: (snapshot: LegacyAppSnapshot) => void;
  now?: () => number;
}

/**
 * Compatibility facade for the legacy multi-project renderer contract.
 * RepositoryService owns repository live state; this class owns ordering and legacy routing.
 */
export class AppService {
  readonly repositoryLocator: RepositoryLocator;
  readonly #managementGit: GitService;
  readonly #managementGithub: GitHubService;
  readonly #managementApprovals: ApprovalManager;
  readonly #repositoryServices = new Map<string, RepositoryService>();
  readonly #repositoryUnsubscribers = new Map<string, () => void>();
  readonly #worktreeOwners = new Map<string, RepositoryService>();
  readonly #approvalOwners = new Map<string, RepositoryService>();
  readonly #diffSessionOwners = new Map<string, RepositoryService>();
  readonly #snapshotUpdateSubscribers = new Set<(snapshot: LegacyAppSnapshot) => void>();
  readonly #homeDirectory: string;
  readonly #systemLocale: string;
  readonly #now: () => number;
  #disposed = false;

  constructor(
    readonly store: StateStore,
    readonly runtime: ApplicationRuntime,
    options: AppServiceOptions = {},
  ) {
    const runner = runtime.commandRunner;
    this.#managementGit = new GitService(runner);
    this.#managementGithub = new GitHubService(runner);
    this.#managementApprovals = new ApprovalManager(runner);
    this.repositoryLocator = new RepositoryLocator(runner);
    this.#homeDirectory = options.homeDirectory ?? os.homedir();
    this.#systemLocale =
      options.systemLocale ?? Intl.DateTimeFormat().resolvedOptions().locale;
    this.#now = options.now ?? Date.now;
    if (options.onSnapshotUpdate) {
      this.#snapshotUpdateSubscribers.add(options.onSnapshotUpdate);
    }
    this.#reconcileRepositoryServices();
  }

  /** Compatibility access for existing tests and transitional callers. */
  get git(): GitService {
    return this.#onlyRepositoryService()?.git ?? this.#managementGit;
  }

  /** Compatibility access for existing tests and transitional callers. */
  get github(): GitHubService {
    return this.#onlyRepositoryService()?.github ?? this.#managementGithub;
  }

  /** Compatibility access for existing tests and transitional callers. */
  get approvals(): ApprovalManager {
    return this.#onlyRepositoryService()?.approvals ?? this.#managementApprovals;
  }

  get runner() {
    return this.runtime.commandRunner;
  }

  repositoryService(repositoryId: string): RepositoryService {
    return this.#serviceForProject(repositoryId);
  }

  async initialize(): Promise<void> {
    this.#assertActive();
    await this.store.load();
    this.#reconcileRepositoryServices();
    await this.refresh();
  }

  snapshot(): LegacyAppSnapshot {
    this.#assertActive();
    this.#reconcileRepositoryServices();
    const persisted = this.store.state;
    return {
      homeDirectory: this.#homeDirectory,
      systemLocale: this.#systemLocale,
      projects: persisted.projects.map(
        (project) =>
          this.#repositoryServices.get(project.id)?.snapshot() ?? {
            ...project,
            worktrees: [],
          },
      ),
      recentRepositories: persisted.recentRepositories,
      settings: persisted.settings,
    };
  }

  subscribeToSnapshotUpdates(
    subscriber: (snapshot: LegacyAppSnapshot) => void,
  ): () => void {
    this.#assertActive();
    this.#snapshotUpdateSubscribers.add(subscriber);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#snapshotUpdateSubscribers.delete(subscriber);
    };
  }

  commandLog(context: unknown): CommandRecord[] {
    this.#assertActive();
    if (!isCommandContext(context)) throw new Error('Invalid command log context.');
    return this.runner.recordsFor(context);
  }

  async addProject(selectedPath: string): Promise<LegacyAppSnapshot> {
    this.#assertActive();
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
      this.#reconcileRepositoryServices();
      return this.snapshot();
    }

    const project = this.#managementGit.createProject(details);
    await this.store.addRepository(
      project,
      location.selectedWorktreePath,
      location.commonDirectoryPath,
    );
    this.#reconcileRepositoryServices();
    await this.#serviceForProject(project.id).refresh({ hydratePullRequests: true });
    this.#rebuildWorktreeOwners();
    return this.snapshot();
  }

  async openRecentRepository(repositoryId: string): Promise<LegacyAppSnapshot> {
    const repository = this.store.state.recentRepositories.find(
      (candidate) => candidate.repositoryId === repositoryId,
    );
    if (!repository) throw new Error('Recent repository not found.');
    return this.addProject(repository.lastOpenedPath);
  }

  async removeProject(projectId: string): Promise<LegacyAppSnapshot> {
    this.#serviceForProject(projectId);
    await this.store.removeRepository(projectId);
    this.#removeRepositoryService(projectId);
    this.#reconcileRepositoryServices();
    return this.snapshot();
  }

  async refresh(): Promise<LegacyAppSnapshot> {
    this.#assertActive();
    this.#reconcileRepositoryServices();
    const services = this.#orderedRepositoryServices();
    await Promise.all(
      services.map((service) =>
        service.refresh({
          tolerateFailure: true,
          hydratePullRequests: true,
          useGlobalRefreshLimit: true,
        }),
      ),
    );
    this.#rebuildWorktreeOwners();
    return this.snapshot();
  }

  async refreshProject(projectId: string): Promise<LegacyAppSnapshot> {
    await this.#serviceForProject(projectId).refresh();
    this.#rebuildWorktreeOwners();
    return this.snapshot();
  }

  listBranches(projectId: string): Promise<string[]> {
    return this.#serviceForProject(projectId).listBranches();
  }

  suggestWorktreePath(projectId: string, branch: string): string {
    return this.#serviceForProject(projectId).suggestWorktreePath(
      this.store.state.settings.defaultWorktreePath,
      branch,
    );
  }

  async createWorktree(request: LegacyCreateWorktreeRequest): Promise<{
    snapshot: LegacyAppSnapshot;
    setupApproval?: ApprovalRequest;
  }> {
    const service = this.#serviceForProject(request.projectId);
    const result = await service.createWorktree({
      branch: request.branch,
      path: request.path,
    });
    this.#rebuildWorktreeOwners();
    if (result.setupApproval) {
      this.#approvalOwners.set(result.setupApproval.approvalId, service);
    }
    return {
      snapshot: this.snapshot(),
      ...(result.setupApproval ? { setupApproval: result.setupApproval } : {}),
    };
  }

  async switchBranch(request: SwitchBranchRequest): Promise<LegacyAppSnapshot> {
    await this.#serviceForWorktree(request.worktreeId).switchBranch(request);
    this.#rebuildWorktreeOwners();
    return this.snapshot();
  }

  prepareRemove(worktreeId: string): ApprovalRequest {
    const service = this.#serviceForWorktree(worktreeId);
    const approval = service.prepareRemove(worktreeId);
    this.#approvalOwners.set(approval.approvalId, service);
    return approval;
  }

  async approve(approvalId: string): Promise<LegacyAppSnapshot> {
    const service = this.#takeApprovalOwner(approvalId);
    await service.approve(approvalId);
    this.#rebuildWorktreeOwners();
    return this.snapshot();
  }

  reject(approvalId: string): LegacyAppSnapshot {
    this.#takeApprovalOwner(approvalId).reject(approvalId);
    return this.snapshot();
  }

  details(worktreeId: string): Promise<WorktreeDetails> {
    return this.#serviceForWorktree(worktreeId).details(worktreeId);
  }

  setComparisonBase(request: unknown): Promise<WorktreeComparison> {
    if (!isSetComparisonBaseRequest(request)) {
      return Promise.reject(new Error('Invalid comparison base request.'));
    }
    return this.#serviceForWorktree(worktreeIdFrom(request)).setComparisonBase(request);
  }

  listBranchCommits(request: unknown) {
    if (!isListBranchCommitsRequest(request)) {
      return Promise.reject(new Error('Invalid branch commit request.'));
    }
    return this.#serviceForWorktree(worktreeIdFrom(request)).listBranchCommits(request);
  }

  async openDiff(worktreeId: string): Promise<DiffSession> {
    const service = this.#serviceForWorktree(worktreeId);
    const session = await service.openDiff(worktreeId);
    this.#diffSessionOwners.set(session.id, service);
    return session;
  }

  async openBranchDiff(request: unknown): Promise<DiffSession> {
    if (!isOpenBranchDiffRequest(request)) {
      throw new Error('Invalid branch comparison request.');
    }
    const service = this.#serviceForProject(projectIdFrom(request));
    const session = await service.openBranchDiff({
      sourceBranch: stringField(request, 'sourceBranch'),
      targetBranch: stringField(request, 'targetBranch'),
    });
    this.#diffSessionOwners.set(session.id, service);
    return session;
  }

  async openCommitDiff(request: unknown): Promise<DiffSession> {
    if (!isOpenCommitDiffRequest(request)) {
      throw new Error('Invalid commit changes request.');
    }
    const service = this.#serviceForProject(projectIdFrom(request));
    const session = await service.openCommitDiff({
      commitHash: stringField(request, 'commitHash'),
    });
    this.#diffSessionOwners.set(session.id, service);
    return session;
  }

  diffFile(request: unknown): Promise<DiffFilePatch> {
    if (!isDiffFileRequest(request)) {
      return Promise.reject(new Error('Invalid diff file request.'));
    }
    return this.#serviceForDiffSession(sessionIdFrom(request)).diffFile(request);
  }

  diffFileEditorTarget(request: unknown): {
    editor: EditorTool;
    filePath: string;
    line?: number;
  } {
    if (!isOpenDiffFileRequest(request)) {
      throw new Error('Invalid open diff file request.');
    }
    return this.#serviceForDiffSession(sessionIdFrom(request)).diffFileEditorTarget(
      request,
    );
  }

  closeDiff(sessionId: string): void {
    if (typeof sessionId !== 'string') throw new Error('Invalid diff session.');
    const service = this.#diffSessionOwners.get(sessionId);
    this.#diffSessionOwners.delete(sessionId);
    service?.closeDiff(sessionId);
  }

  refreshPullRequest(worktreeId: string): Promise<PullRequest | undefined> {
    return this.#serviceForWorktree(worktreeId).refreshPullRequest(worktreeId);
  }

  worktreeStatus(worktreeId: string): Promise<WorktreeStatus> {
    return this.#serviceForWorktree(worktreeId).worktreeStatus(worktreeId);
  }

  worktreePath(worktreeId: string): string {
    return this.#serviceForWorktree(worktreeId).worktreePath(worktreeId);
  }

  async updateSettings(settings: Settings): Promise<LegacyAppSnapshot> {
    if (!isSettings(settings)) throw new Error('Invalid settings.');
    if (!settings.defaultWorktreePath.trim()) {
      throw new Error('The default path cannot be empty.');
    }
    await this.store.update((state) => {
      state.settings = {
        ...settings,
        defaultWorktreePath: settings.defaultWorktreePath.trim(),
      };
    });
    return this.snapshot();
  }

  async updateProjectSetup(
    projectId: string,
    script: string,
  ): Promise<LegacyAppSnapshot> {
    await this.#serviceForProject(projectId).updateSetup(script);
    return this.snapshot();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const projectId of [...this.#repositoryServices.keys()]) {
      this.#removeRepositoryService(projectId);
    }
    this.#managementApprovals.dispose();
    this.#managementGit.dispose();
    this.#snapshotUpdateSubscribers.clear();
    this.#worktreeOwners.clear();
    this.#approvalOwners.clear();
    this.#diffSessionOwners.clear();
  }

  #reconcileRepositoryServices(): void {
    if (this.#disposed) return;
    const persisted = this.store.state;
    const activeIds = new Set(persisted.projects.map((project) => project.id));
    for (const projectId of this.#repositoryServices.keys()) {
      if (!activeIds.has(projectId)) this.#removeRepositoryService(projectId);
    }
    for (const project of persisted.projects) {
      const canonicalKey =
        persisted.recentRepositories.find(
          (repository) => repository.repositoryId === project.id,
        )?.commonDirectoryPath ?? project.path;
      const existing = this.#repositoryServices.get(project.id);
      if (existing?.canonicalRepositoryKey === canonicalKey) continue;
      if (existing) this.#removeRepositoryService(project.id);
      const service = new RepositoryService(
        project,
        canonicalKey,
        this.store,
        this.runtime,
        {
          now: this.#now,
        },
      );
      this.#repositoryServices.set(project.id, service);
      this.#repositoryUnsubscribers.set(
        project.id,
        service.subscribeToSnapshotUpdates(() => {
          this.#rebuildWorktreeOwners();
          this.#publishSnapshotUpdate();
        }),
      );
    }
    this.#rebuildWorktreeOwners();
  }

  #removeRepositoryService(projectId: string): void {
    const service = this.#repositoryServices.get(projectId);
    this.#repositoryUnsubscribers.get(projectId)?.();
    this.#repositoryUnsubscribers.delete(projectId);
    this.#repositoryServices.delete(projectId);
    if (!service) return;
    service.dispose();
    for (const [approvalId, owner] of this.#approvalOwners) {
      if (owner === service) this.#approvalOwners.delete(approvalId);
    }
    for (const [sessionId, owner] of this.#diffSessionOwners) {
      if (owner === service) this.#diffSessionOwners.delete(sessionId);
    }
    this.#rebuildWorktreeOwners();
  }

  #orderedRepositoryServices(): RepositoryService[] {
    return this.store.state.projects.map((project) =>
      this.#serviceForProject(project.id),
    );
  }

  #rebuildWorktreeOwners(): void {
    this.#worktreeOwners.clear();
    for (const service of this.#repositoryServices.values()) {
      if (service.disposed) continue;
      for (const worktree of service.snapshot().worktrees) {
        this.#worktreeOwners.set(worktree.id, service);
      }
    }
  }

  #serviceForProject(projectId: string): RepositoryService {
    this.#assertActive();
    const service = this.#repositoryServices.get(projectId);
    if (!service || service.disposed) throw new Error('Project not found.');
    return service;
  }

  #serviceForWorktree(worktreeId: string): RepositoryService {
    this.#assertActive();
    const service = this.#worktreeOwners.get(worktreeId);
    if (!service || service.disposed) {
      throw new Error('Worktree not found. Refresh the project and try again.');
    }
    return service;
  }

  #serviceForDiffSession(sessionId: string): RepositoryService {
    this.#assertActive();
    const service = this.#diffSessionOwners.get(sessionId);
    if (!service || service.disposed) {
      throw new Error('The diff session expired. Close and reopen it.');
    }
    return service;
  }

  #takeApprovalOwner(approvalId: string): RepositoryService {
    this.#assertActive();
    const service = this.#approvalOwners.get(approvalId);
    this.#approvalOwners.delete(approvalId);
    if (!service || service.disposed) {
      throw new Error('This approval request expired. Please start the action again.');
    }
    return service;
  }

  #onlyRepositoryService(): RepositoryService | undefined {
    return this.#repositoryServices.size === 1
      ? this.#repositoryServices.values().next().value
      : undefined;
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
    if (this.#disposed) throw new Error('The application service is disposed.');
  }
}

function projectIdFrom(value: unknown): string {
  if (!value || typeof value !== 'object' || !('projectId' in value)) return '';
  return typeof value.projectId === 'string' ? value.projectId : '';
}

function worktreeIdFrom(value: unknown): string {
  if (!value || typeof value !== 'object' || !('worktreeId' in value)) return '';
  return typeof value.worktreeId === 'string' ? value.worktreeId : '';
}

function sessionIdFrom(value: unknown): string {
  if (!value || typeof value !== 'object' || !('sessionId' in value)) return '';
  return typeof value.sessionId === 'string' ? value.sessionId : '';
}

function stringField(value: unknown, key: string): string {
  if (!value || typeof value !== 'object' || !(key in value)) return '';
  const field = value[key as keyof typeof value];
  return typeof field === 'string' ? field : '';
}

function isOpenBranchDiffRequest(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.projectId === 'string' &&
    typeof request.sourceBranch === 'string' &&
    typeof request.targetBranch === 'string'
  );
}

function isDiffFileRequest(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return typeof request.sessionId === 'string' && typeof request.fileId === 'string';
}

function isOpenDiffFileRequest(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    isDiffFileRequest(value) &&
    request.editor === 'vscode' &&
    (request.line === undefined ||
      (typeof request.line === 'number' &&
        Number.isSafeInteger(request.line) &&
        request.line > 0))
  );
}

function isSetComparisonBaseRequest(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.worktreeId === 'string' &&
    (request.targetBranch === undefined || typeof request.targetBranch === 'string')
  );
}

function isListBranchCommitsRequest(value: unknown): boolean {
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

function isOpenCommitDiffRequest(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.projectId === 'string' &&
    typeof request.commitHash === 'string' &&
    /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(request.commitHash)
  );
}
