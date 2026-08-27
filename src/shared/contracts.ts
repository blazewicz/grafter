export type ToolName = 'git' | 'github' | 'shell';
export type CommandStatus = 'running' | 'succeeded' | 'failed' | 'awaiting-approval';
export type EditorTool = 'vscode';
export type TerminalTool = 'terminal' | 'iterm2';
export type ToolPickerGroup = 'editor' | 'terminal';
export type DateFormatPreference =
  'system' | 'day-month-year' | 'month-day-year' | 'year-month-day';
export type TimeFormatPreference = 'system' | '24-hour' | '12-hour';

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
  durationMs?: number;
  exitCode?: number;
  output: CommandOutput[];
}

export interface Settings {
  defaultWorktreePath: string;
  dateFormat: DateFormatPreference;
  timeFormat: TimeFormatPreference;
}

export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  setupScript?: string;
}

export type PullRequestState = 'OPEN' | 'DRAFT' | 'MERGED' | 'CLOSED';

export function pullRequestStateFromGitHub(
  state: unknown,
  isDraft: unknown,
): PullRequestState | undefined {
  if (typeof isDraft !== 'boolean') return undefined;
  if (state === 'OPEN') return isDraft ? 'DRAFT' : 'OPEN';
  if (state === 'MERGED' || state === 'CLOSED') return state;
  return undefined;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: PullRequestState;
  baseBranch: string;
}

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

export interface GitHubRepository {
  owner: string;
  name: string;
}

export type DiffFileStatus =
  'added' | 'copied' | 'deleted' | 'modified' | 'renamed' | 'type-changed';

export interface DiffFileSummary {
  id: string;
  path: string;
  previousPath?: string;
  status: DiffFileStatus;
  additions?: number;
  deletions?: number;
  binary: boolean;
}

interface DiffSessionBase {
  id: string;
  projectId: string;
  baseSha: string;
  headSha: string;
  githubRepository?: GitHubRepository;
  stats: DiffStats;
  files: DiffFileSummary[];
}

export interface BranchDiffSession extends DiffSessionBase {
  kind: 'branch';
  sourceWorktreeId?: string;
  branch: string;
  targetBranch: string;
}

export interface CommitDiffSession extends DiffSessionBase {
  kind: 'commit';
  commit: CommitDetails;
  parentShas: string[];
}

export type DiffSession = BranchDiffSession | CommitDiffSession;

export type OpenDiffWindowRequest =
  { kind: 'worktree'; worktreeId: string } | { kind: 'commit'; commitHash: string };

/** Initial state delivered to a freshly opened diff window. */
export interface DiffWindowInit {
  session: DiffSession;
}

export function isOpenBranchDiffRequest(value: unknown): value is OpenBranchDiffRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.sourceBranch === 'string' &&
    Boolean(request.sourceBranch) &&
    typeof request.targetBranch === 'string' &&
    Boolean(request.targetBranch) &&
    Object.keys(request).length === 2
  );
}

export function isOpenDiffWindowRequest(value: unknown): value is OpenDiffWindowRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (request.kind === 'worktree') {
    return (
      typeof request.worktreeId === 'string' &&
      Boolean(request.worktreeId) &&
      Object.keys(request).length === 2
    );
  }
  return (
    request.kind === 'commit' &&
    typeof request.commitHash === 'string' &&
    Boolean(request.commitHash) &&
    Object.keys(request).length === 2
  );
}

export interface OpenBranchDiffRequest {
  sourceBranch: string;
  targetBranch: string;
}

export interface OpenCommitDiffRequest {
  commitHash: string;
}

export interface SetComparisonBaseRequest {
  worktreeId: string;
  targetBranch?: string;
}

export interface ListBranchCommitsRequest {
  worktreeId: string;
  targetBranch: string;
  offset: number;
  limit: number;
}

export type DiffLineKind = 'context' | 'addition' | 'deletion' | 'annotation';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFilePatch {
  fileId: string;
  binary: boolean;
  hunks: DiffHunk[];
}

export interface DiffFileRequest {
  sessionId: string;
  fileId: string;
}

export interface OpenDiffFileRequest extends DiffFileRequest {
  editor: EditorTool;
  line?: number;
}

export interface Commit {
  hash: string;
  title: string;
  authorName: string;
  authorEmail?: string;
  authoredAt: string;
}

export interface CommitDetails extends Commit {
  body: string;
  stats: DiffStats;
}

export interface CommitPage {
  commits: Commit[];
  total: number;
  hasMore: boolean;
}

export interface Worktree {
  id: string;
  projectId: string;
  displayName: string;
  path: string;
  branch: string;
  pullRequest?: PullRequest;
  head: string;
  isMain: boolean;
  locked: boolean;
}

export type WorktreeStatus = 'clean' | 'dirty';

export interface WorktreeComparison {
  automaticBaseBranch?: string;
  automaticBaseBranchUnavailable?: boolean;
  comparisonBaseOverride?: string;
  comparisonBaseOverrideUnavailable?: boolean;
  targetBranch?: string;
  diffStats?: DiffStats;
}

export interface WorktreeDetails extends Worktree, WorktreeComparison {
  projectName: string;
}

export interface Project extends ProjectConfig {
  worktrees: Worktree[];
}

export interface RecentRepository {
  repositoryId: string;
  name: string;
  /** Canonical runtime key when it has been discovered by the main process. */
  commonDirectoryPath?: string;
  mainWorktreePath: string;
  lastOpenedPath: string;
  lastOpenedAt: string;
}

interface WindowSnapshotBase {
  homeDirectory: string;
  systemLocale: string;
  settings: Settings;
  toolPreferences: Record<ToolPickerGroup, string>;
}

export interface LoadingWindowSnapshot {
  kind: 'loading';
}

export interface WelcomeWindowSnapshot extends WindowSnapshotBase {
  kind: 'welcome';
  recentRepositories: RecentRepository[];
}

export interface RepositoryWindowSnapshot extends WindowSnapshotBase {
  kind: 'repository';
  repository: Project;
  selectedWorktreeId?: string;
  worktreeSelectionRequestId?: number;
}

export interface DiffWindowSnapshot extends WindowSnapshotBase {
  kind: 'diff';
}

export type AppSnapshot =
  | LoadingWindowSnapshot
  | WelcomeWindowSnapshot
  | RepositoryWindowSnapshot
  | DiffWindowSnapshot;

export interface ApprovalRequest {
  approvalId: string;
  command: CommandRecord;
  warning: string;
}

export interface CreateWorktreeRequest {
  branch: string;
  path: string;
}

export interface SwitchBranchRequest {
  worktreeId: string;
  branch: string;
}

export interface GrafterApi {
  getSnapshot(): Promise<AppSnapshot>;
  getCommandLog(scope: CommandLogScope): Promise<CommandRecord[]>;
  chooseRepository(): Promise<AppSnapshot | null>;
  openRecentRepository(repositoryId: string): Promise<AppSnapshot>;
  refresh(): Promise<AppSnapshot>;
  listBranches(): Promise<string[]>;
  suggestWorktreePath(branch: string): Promise<string>;
  createWorktree(request: CreateWorktreeRequest): Promise<{
    snapshot: AppSnapshot;
    setupApproval?: ApprovalRequest;
  }>;
  switchBranch(request: SwitchBranchRequest): Promise<AppSnapshot>;
  prepareRemoveWorktree(worktreeId: string): Promise<ApprovalRequest>;
  approveCommand(approvalId: string): Promise<AppSnapshot>;
  rejectCommand(approvalId: string): Promise<AppSnapshot>;
  getWorktreeDetails(worktreeId: string): Promise<WorktreeDetails>;
  setComparisonBase(request: SetComparisonBaseRequest): Promise<WorktreeComparison>;
  listBranchCommits(request: ListBranchCommitsRequest): Promise<CommitPage>;
  openDiffWindow(request: OpenDiffWindowRequest): Promise<void>;
  getDiffWindowInit(): Promise<DiffWindowInit>;
  closeDiffWindow(): Promise<void>;
  openBranchDiff(request: OpenBranchDiffRequest): Promise<DiffSession>;
  getDiffFile(request: DiffFileRequest): Promise<DiffFilePatch>;
  closeDiff(sessionId: string): Promise<void>;
  refreshPullRequest(worktreeId: string): Promise<PullRequest | undefined>;
  getWorktreeStatus(worktreeId: string): Promise<WorktreeStatus>;
  updateSettings(settings: Settings): Promise<AppSnapshot>;
  setToolPreference(group: ToolPickerGroup, tool: string): Promise<AppSnapshot>;
  updateRepositorySetup(script: string): Promise<AppSnapshot>;
  openWorktreeDirectory(worktreeId: string): Promise<void>;
  openWorktreeInTerminal(worktreeId: string, tool: TerminalTool): Promise<void>;
  openWorktreeInEditor(worktreeId: string, editor: EditorTool): Promise<void>;
  openDiffFileInEditor(request: OpenDiffFileRequest): Promise<void>;
  openExternal(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
  onSnapshotUpdate(listener: (snapshot: AppSnapshot) => void): () => void;
  onCommandUpdate(listener: (command: CommandRecord) => void): () => void;
}

export type CommandLogScope =
  { kind: 'repository' } | { kind: 'worktree'; worktreeId: string };
