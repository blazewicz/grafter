import { isCommandContext } from '../shared/command-context';
import type {
  AppSnapshot,
  ApprovalRequest,
  CommandRecord,
  CreateWorktreeRequest,
  DiffFilePatch,
  DiffSession,
  EditorTool,
  Settings,
  SwitchBranchRequest,
  WorktreeComparison,
  WorktreeDetails,
  WorktreeStatus,
} from '../shared/contracts';
import { isSettings } from '../shared/settings';
import type { ApplicationRuntime } from './application-runtime';
import type { RepositoryService } from './services/repository-service';
import type { StateStore } from './store';

type SnapshotSubscriber = (snapshot: AppSnapshot) => void;

export interface WindowSessionService {
  snapshot(): AppSnapshot;
  commandLog(context: unknown): CommandRecord[];
  refresh(): Promise<AppSnapshot>;
  refreshProject(projectId: string): Promise<AppSnapshot>;
  listBranches(projectId: string): Promise<string[]>;
  suggestWorktreePath(projectId: string, branch: string): string;
  createWorktree(request: CreateWorktreeRequest): Promise<{
    snapshot: AppSnapshot;
    setupApproval?: ApprovalRequest;
  }>;
  switchBranch(request: SwitchBranchRequest): Promise<AppSnapshot>;
  prepareRemove(worktreeId: string): ApprovalRequest;
  approve(approvalId: string): Promise<AppSnapshot>;
  reject(approvalId: string): AppSnapshot;
  details(worktreeId: string): Promise<WorktreeDetails>;
  setComparisonBase(request: unknown): Promise<WorktreeComparison>;
  listBranchCommits(request: unknown): ReturnType<RepositoryService['listBranchCommits']>;
  openDiff(worktreeId: string): Promise<DiffSession>;
  openBranchDiff(request: unknown): Promise<DiffSession>;
  openCommitDiff(request: unknown): Promise<DiffSession>;
  diffFile(request: unknown): Promise<DiffFilePatch>;
  closeDiff(sessionId: string): void;
  refreshPullRequest(
    worktreeId: string,
  ): ReturnType<RepositoryService['refreshPullRequest']>;
  worktreeStatus(worktreeId: string): Promise<WorktreeStatus>;
  updateSettings(settings: Settings): Promise<AppSnapshot>;
  updateProjectSetup(projectId: string, script: string): Promise<AppSnapshot>;
  worktreePath(worktreeId: string): string;
  diffFileEditorTarget(request: unknown): {
    editor: EditorTool;
    filePath: string;
    line?: number;
  };
}

interface CompatibilitySnapshotContext {
  homeDirectory: string;
  systemLocale: string;
}

/**
 * WU7 compatibility boundary: adapts one RepositoryService to the old AppSnapshot
 * shape with exactly one project. WU9 replaces this class with singular contracts.
 */
export class RepositoryWindowSession implements WindowSessionService {
  readonly #snapshotSubscribers = new Set<SnapshotSubscriber>();
  readonly #commandUnsubscribers = new Set<() => void>();
  readonly #unsubscribeRepository: () => void;
  #selectedWorktreeId: string | undefined;
  #worktreeSelectionRequestId = 0;
  #disposed = false;

  constructor(
    readonly repository: RepositoryService,
    readonly store: StateStore,
    readonly runtime: ApplicationRuntime,
    readonly context: CompatibilitySnapshotContext,
  ) {
    this.#unsubscribeRepository = repository.subscribeToSnapshotUpdates(() =>
      this.#publishSnapshot(),
    );
  }

  snapshot(): AppSnapshot {
    this.#assertActive();
    const persisted = this.store.state;
    return {
      homeDirectory: this.context.homeDirectory,
      systemLocale: this.context.systemLocale,
      projects: [this.repository.snapshot()],
      recentRepositories: persisted.recentRepositories,
      settings: persisted.settings,
      ...(this.#selectedWorktreeId
        ? {
            selectedWorktreeId: this.#selectedWorktreeId,
            worktreeSelectionRequestId: this.#worktreeSelectionRequestId,
          }
        : {}),
    };
  }

  subscribeToSnapshotUpdates(subscriber: SnapshotSubscriber): () => void {
    this.#assertActive();
    this.#snapshotSubscribers.add(subscriber);
    return once(() => this.#snapshotSubscribers.delete(subscriber));
  }

  subscribeToCommandUpdates(subscriber: (record: CommandRecord) => void): () => void {
    this.#assertActive();
    const unsubscribeRuntime = this.runtime.subscribeToCommandUpdates((record) => {
      if (
        record.context.kind !== 'application' &&
        record.context.projectId === this.repository.repositoryId
      ) {
        subscriber(record);
      }
    });
    const unsubscribe = once(() => {
      unsubscribeRuntime();
      this.#commandUnsubscribers.delete(unsubscribe);
    });
    this.#commandUnsubscribers.add(unsubscribe);
    return unsubscribe;
  }

  selectWorktreePath(worktreePath: string): void {
    this.#assertActive();
    const worktree = this.repository
      .snapshot()
      .worktrees.find((candidate) => candidate.path === worktreePath);
    if (!worktree) {
      throw new Error('The requested worktree is no longer available.');
    }
    this.#selectedWorktreeId = worktree.id;
    this.#worktreeSelectionRequestId += 1;
    this.#publishSnapshot();
  }

  publishSnapshot(): void {
    this.#publishSnapshot();
  }

  commandLog(context: unknown): CommandRecord[] {
    this.#assertActive();
    if (!isCommandContext(context)) throw new Error('Invalid command log context.');
    if (
      context.kind === 'application' ||
      context.projectId !== this.repository.repositoryId
    ) {
      throw new Error('Command context is not available in this repository window.');
    }
    return this.runtime.commandRunner.recordsFor(context);
  }

  async refresh(): Promise<AppSnapshot> {
    await this.repository.refresh();
    return this.snapshot();
  }

  async refreshProject(projectId: string): Promise<AppSnapshot> {
    this.#assertProject(projectId);
    return this.refresh();
  }

  listBranches(projectId: string): Promise<string[]> {
    this.#assertProject(projectId);
    return this.repository.listBranches();
  }

  suggestWorktreePath(projectId: string, branch: string): string {
    this.#assertProject(projectId);
    return this.repository.suggestWorktreePath(
      this.store.state.settings.defaultWorktreePath,
      branch,
    );
  }

  async createWorktree(request: CreateWorktreeRequest): Promise<{
    snapshot: AppSnapshot;
    setupApproval?: ApprovalRequest;
  }> {
    const result = await this.repository.createWorktree(request);
    return {
      snapshot: this.snapshot(),
      ...(result.setupApproval ? { setupApproval: result.setupApproval } : {}),
    };
  }

  async switchBranch(request: SwitchBranchRequest): Promise<AppSnapshot> {
    await this.repository.switchBranch(request);
    return this.snapshot();
  }

  prepareRemove(worktreeId: string): ApprovalRequest {
    return this.repository.prepareRemove(worktreeId);
  }

  async approve(approvalId: string): Promise<AppSnapshot> {
    await this.repository.approve(approvalId);
    return this.snapshot();
  }

  reject(approvalId: string): AppSnapshot {
    this.repository.reject(approvalId);
    return this.snapshot();
  }

  details(worktreeId: string): Promise<WorktreeDetails> {
    return this.repository.details(worktreeId);
  }

  setComparisonBase(request: unknown): Promise<WorktreeComparison> {
    return this.repository.setComparisonBase(request);
  }

  listBranchCommits(
    request: unknown,
  ): ReturnType<RepositoryService['listBranchCommits']> {
    return this.repository.listBranchCommits(request);
  }

  openDiff(worktreeId: string): Promise<DiffSession> {
    return this.repository.openDiff(worktreeId);
  }

  openBranchDiff(request: unknown): Promise<DiffSession> {
    return this.repository.openBranchDiff(request);
  }

  openCommitDiff(request: unknown): Promise<DiffSession> {
    return this.repository.openCommitDiff(request);
  }

  diffFile(request: unknown): Promise<DiffFilePatch> {
    return this.repository.diffFile(request);
  }

  closeDiff(sessionId: string): void {
    this.repository.closeDiff(sessionId);
  }

  refreshPullRequest(
    worktreeId: string,
  ): ReturnType<RepositoryService['refreshPullRequest']> {
    return this.repository.refreshPullRequest(worktreeId);
  }

  worktreeStatus(worktreeId: string): Promise<WorktreeStatus> {
    return this.repository.worktreeStatus(worktreeId);
  }

  async updateSettings(settings: Settings): Promise<AppSnapshot> {
    await updateSettings(this.store, settings);
    return this.snapshot();
  }

  async updateProjectSetup(projectId: string, script: string): Promise<AppSnapshot> {
    this.#assertProject(projectId);
    await this.repository.updateSetup(script);
    return this.snapshot();
  }

  worktreePath(worktreeId: string): string {
    return this.repository.worktreePath(worktreeId);
  }

  diffFileEditorTarget(request: unknown): {
    editor: EditorTool;
    filePath: string;
    line?: number;
  } {
    return this.repository.diffFileEditorTarget(request);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeRepository();
    for (const unsubscribe of [...this.#commandUnsubscribers]) unsubscribe();
    this.#snapshotSubscribers.clear();
    this.repository.dispose();
  }

  #assertProject(projectId: string): void {
    this.#assertActive();
    if (projectId !== this.repository.repositoryId) {
      throw new Error('Project not found.');
    }
  }

  #publishSnapshot(): void {
    if (this.#disposed) return;
    const snapshot = this.snapshot();
    for (const subscriber of this.#snapshotSubscribers) subscriber(snapshot);
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('The repository window session is disposed.');
  }
}

/** WU7 compatibility boundary for a welcome window: zero projects and no Git service. */
export class WelcomeWindowSession implements WindowSessionService {
  readonly #snapshotSubscribers = new Set<SnapshotSubscriber>();
  #disposed = false;

  constructor(
    readonly store: StateStore,
    readonly context: CompatibilitySnapshotContext,
  ) {}

  snapshot(): AppSnapshot {
    this.#assertActive();
    const persisted = this.store.state;
    return {
      homeDirectory: this.context.homeDirectory,
      systemLocale: this.context.systemLocale,
      projects: [],
      recentRepositories: persisted.recentRepositories,
      settings: persisted.settings,
    };
  }

  subscribeToSnapshotUpdates(subscriber: SnapshotSubscriber): () => void {
    this.#assertActive();
    this.#snapshotSubscribers.add(subscriber);
    return once(() => this.#snapshotSubscribers.delete(subscriber));
  }

  subscribeToCommandUpdates(_subscriber: (record: CommandRecord) => void): () => void {
    this.#assertActive();
    void _subscriber;
    return () => undefined;
  }

  publishSnapshot(): void {
    if (this.#disposed) return;
    const snapshot = this.snapshot();
    for (const subscriber of this.#snapshotSubscribers) subscriber(snapshot);
  }

  async updateSettings(settings: Settings): Promise<AppSnapshot> {
    await updateSettings(this.store, settings);
    this.publishSnapshot();
    return this.snapshot();
  }

  commandLog(): CommandRecord[] {
    return this.#unavailable();
  }

  refresh(): Promise<AppSnapshot> {
    return this.#unavailable();
  }

  refreshProject(): Promise<AppSnapshot> {
    return this.#unavailable();
  }

  listBranches(): Promise<string[]> {
    return this.#unavailable();
  }

  suggestWorktreePath(): string {
    return this.#unavailable();
  }

  createWorktree(): Promise<{
    snapshot: AppSnapshot;
    setupApproval?: ApprovalRequest;
  }> {
    return this.#unavailable();
  }

  switchBranch(): Promise<AppSnapshot> {
    return this.#unavailable();
  }

  prepareRemove(): ApprovalRequest {
    return this.#unavailable();
  }

  approve(): Promise<AppSnapshot> {
    return this.#unavailable();
  }

  reject(): AppSnapshot {
    return this.#unavailable();
  }

  details(): Promise<WorktreeDetails> {
    return this.#unavailable();
  }

  setComparisonBase(): Promise<WorktreeComparison> {
    return this.#unavailable();
  }

  listBranchCommits(): ReturnType<RepositoryService['listBranchCommits']> {
    return this.#unavailable();
  }

  openDiff(): Promise<DiffSession> {
    return this.#unavailable();
  }

  openBranchDiff(): Promise<DiffSession> {
    return this.#unavailable();
  }

  openCommitDiff(): Promise<DiffSession> {
    return this.#unavailable();
  }

  diffFile(): Promise<DiffFilePatch> {
    return this.#unavailable();
  }

  closeDiff(): void {
    this.#unavailable();
  }

  refreshPullRequest(): ReturnType<RepositoryService['refreshPullRequest']> {
    return this.#unavailable();
  }

  worktreeStatus(): Promise<WorktreeStatus> {
    return this.#unavailable();
  }

  updateProjectSetup(): Promise<AppSnapshot> {
    return this.#unavailable();
  }

  worktreePath(): string {
    return this.#unavailable();
  }

  diffFileEditorTarget(): {
    editor: EditorTool;
    filePath: string;
    line?: number;
  } {
    return this.#unavailable();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#snapshotSubscribers.clear();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('The welcome window session is disposed.');
  }

  #unavailable(): never {
    this.#assertActive();
    throw new Error('This operation requires an open repository.');
  }
}

async function updateSettings(store: StateStore, settings: Settings): Promise<void> {
  if (!isSettings(settings)) throw new Error('Invalid settings.');
  if (!settings.defaultWorktreePath.trim()) {
    throw new Error('The default path cannot be empty.');
  }
  await store.update((state) => {
    state.settings = {
      ...settings,
      defaultWorktreePath: settings.defaultWorktreePath.trim(),
    };
  });
}

function once(action: () => void): () => void {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    action();
  };
}
