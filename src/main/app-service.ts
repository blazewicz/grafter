import path from 'node:path';
import { isCommandContext } from '../shared/command-context';
import type {
  AppSnapshot,
  ApprovalRequest,
  CommandRecord,
  CreateWorktreeRequest,
  Project,
  ProjectTreeItem,
  Settings,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../shared/contracts';
import { expandWorktreeTemplate, worktreePathForBranch } from '../shared/paths';
import { ApprovalManager } from './approvals';
import type { CommandRunner } from './commands';
import { GitService } from './git-service';
import type { StateStore } from './store';

export class AppService {
  readonly git: GitService;
  readonly approvals: ApprovalManager;
  #trees: ProjectTreeItem[] = [];

  constructor(
    readonly store: StateStore,
    readonly runner: CommandRunner,
  ) {
    this.git = new GitService(runner);
    this.approvals = new ApprovalManager(runner);
  }

  async initialize(): Promise<void> {
    await this.store.load();
    await this.refresh();
  }

  snapshot(): AppSnapshot {
    return {
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
    const trees: ProjectTreeItem[] = [];
    for (const project of this.store.state.projects) {
      try {
        trees.push({ ...project, worktrees: await this.git.listWorktrees(project) });
      } catch {
        trees.push({ ...project, worktrees: [] });
      }
    }
    this.#trees = trees;
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

  async worktreeStatus(worktreeId: string): Promise<WorktreeStatus> {
    return this.git.status(this.#worktree(worktreeId));
  }

  worktreePath(worktreeId: string): string {
    return this.#worktree(worktreeId).path;
  }

  async updateSettings(settings: Settings): Promise<AppSnapshot> {
    if (!settings.defaultWorktreePath.trim())
      throw new Error('The default path cannot be empty.');
    await this.store.update((state) => {
      state.settings = { defaultWorktreePath: settings.defaultWorktreePath.trim() };
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
}
