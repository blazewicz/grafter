export type ToolName = 'git' | 'github' | 'shell';
export type CommandStatus = 'running' | 'succeeded' | 'failed' | 'awaiting-approval';
export type EditorTool = 'vscode';

export type CommandContext =
  | { kind: 'application' }
  | { kind: 'project'; projectId: string }
  | { kind: 'worktree'; projectId: string; worktreeId: string };

export interface CommandOutput {
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
  timestamp: string;
}

export interface CommandRecord {
  id: string;
  context: CommandContext;
  tool: ToolName;
  executable: string;
  args: string[];
  cwd: string;
  displayCommand: string;
  purpose: string;
  isReadOnly: boolean;
  status: CommandStatus;
  requiresApproval: boolean;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  output: CommandOutput[];
}

export interface Settings {
  defaultWorktreePath: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  setupScript?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
  baseBranch: string;
}

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

export interface Worktree {
  id: string;
  projectId: string;
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
  locked: boolean;
}

export type WorktreeStatus = 'clean' | 'dirty';

export interface WorktreeDetails extends Worktree {
  projectName: string;
  targetBranch: string;
  diff: DiffStats;
  pullRequest?: PullRequest;
}

export interface ProjectTreeItem extends Project {
  worktrees: Worktree[];
}

export interface AppSnapshot {
  projects: ProjectTreeItem[];
  settings: Settings;
}

export interface ApprovalRequest {
  approvalId: string;
  command: CommandRecord;
  warning: string;
}

export interface CreateWorktreeRequest {
  projectId: string;
  branch: string;
  path: string;
}

export interface GrafterApi {
  getSnapshot(): Promise<AppSnapshot>;
  getCommandLog(context: CommandContext): Promise<CommandRecord[]>;
  chooseProject(): Promise<AppSnapshot | null>;
  removeProject(projectId: string): Promise<AppSnapshot>;
  refresh(): Promise<AppSnapshot>;
  listBranches(projectId: string): Promise<string[]>;
  suggestWorktreePath(projectId: string, branch: string): Promise<string>;
  createWorktree(request: CreateWorktreeRequest): Promise<{
    snapshot: AppSnapshot;
    setupApproval?: ApprovalRequest;
  }>;
  prepareRemoveWorktree(worktreeId: string): Promise<ApprovalRequest>;
  approveCommand(approvalId: string): Promise<AppSnapshot>;
  rejectCommand(approvalId: string): Promise<AppSnapshot>;
  getWorktreeDetails(worktreeId: string): Promise<WorktreeDetails>;
  getWorktreeStatus(worktreeId: string): Promise<WorktreeStatus>;
  updateSettings(settings: Settings): Promise<AppSnapshot>;
  updateProjectSetup(projectId: string, script: string): Promise<AppSnapshot>;
  openWorktreeDirectory(worktreeId: string): Promise<void>;
  openWorktreeInEditor(worktreeId: string, editor: EditorTool): Promise<void>;
  openExternal(url: string): Promise<void>;
  copyCommand(command: string): Promise<void>;
  onCommandUpdate(listener: (command: CommandRecord) => void): () => void;
}
