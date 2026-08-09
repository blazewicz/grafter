import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSnapshot,
  CommandLogScope,
  CommandRecord,
  CreateWorktreeRequest,
  DiffFileRequest,
  GrafterApi,
  ListBranchCommitsRequest,
  OpenBranchDiffRequest,
  OpenCommitDiffRequest,
  OpenDiffFileRequest,
  SetComparisonBaseRequest,
  Settings,
  SwitchBranchRequest,
} from '../shared/contracts';
import { ipc } from '../shared/ipc';

const api: GrafterApi = {
  getSnapshot: () => ipcRenderer.invoke(ipc.snapshot),
  getCommandLog: (scope: CommandLogScope) => ipcRenderer.invoke(ipc.commandLog, scope),
  chooseRepository: () => ipcRenderer.invoke(ipc.chooseRepository),
  openRecentRepository: (repositoryId) =>
    ipcRenderer.invoke(ipc.openRecentRepository, repositoryId),
  refresh: () => ipcRenderer.invoke(ipc.refresh),
  listBranches: () => ipcRenderer.invoke(ipc.listBranches),
  suggestWorktreePath: (branch) => ipcRenderer.invoke(ipc.suggestWorktreePath, branch),
  createWorktree: (request: CreateWorktreeRequest) =>
    ipcRenderer.invoke(ipc.createWorktree, request),
  switchBranch: (request: SwitchBranchRequest) =>
    ipcRenderer.invoke(ipc.switchBranch, request),
  prepareRemoveWorktree: (worktreeId) =>
    ipcRenderer.invoke(ipc.prepareRemove, worktreeId),
  approveCommand: (approvalId) => ipcRenderer.invoke(ipc.approveCommand, approvalId),
  rejectCommand: (approvalId) => ipcRenderer.invoke(ipc.rejectCommand, approvalId),
  getWorktreeDetails: (worktreeId) => ipcRenderer.invoke(ipc.worktreeDetails, worktreeId),
  setComparisonBase: (request: SetComparisonBaseRequest) =>
    ipcRenderer.invoke(ipc.setComparisonBase, request),
  listBranchCommits: (request: ListBranchCommitsRequest) =>
    ipcRenderer.invoke(ipc.listBranchCommits, request),
  openDiff: (worktreeId) => ipcRenderer.invoke(ipc.openDiff, worktreeId),
  openBranchDiff: (request: OpenBranchDiffRequest) =>
    ipcRenderer.invoke(ipc.openBranchDiff, request),
  openCommitDiff: (request: OpenCommitDiffRequest) =>
    ipcRenderer.invoke(ipc.openCommitDiff, request),
  getDiffFile: (request: DiffFileRequest) => ipcRenderer.invoke(ipc.diffFile, request),
  closeDiff: (sessionId) => ipcRenderer.invoke(ipc.closeDiff, sessionId),
  refreshPullRequest: (worktreeId) =>
    ipcRenderer.invoke(ipc.refreshPullRequest, worktreeId),
  getWorktreeStatus: (worktreeId) => ipcRenderer.invoke(ipc.worktreeStatus, worktreeId),
  updateSettings: (settings: Settings) =>
    ipcRenderer.invoke(ipc.updateSettings, settings),
  updateRepositorySetup: (script) =>
    ipcRenderer.invoke(ipc.updateRepositorySetup, script),
  openWorktreeDirectory: (worktreeId) =>
    ipcRenderer.invoke(ipc.openWorktreeDirectory, worktreeId),
  openWorktreeInTerminal: (worktreeId, tool) =>
    ipcRenderer.invoke(ipc.openWorktreeInTerminal, worktreeId, tool),
  openWorktreeInEditor: (worktreeId, editor) =>
    ipcRenderer.invoke(ipc.openWorktreeInEditor, worktreeId, editor),
  openDiffFileInEditor: (request: OpenDiffFileRequest) =>
    ipcRenderer.invoke(ipc.openDiffFileInEditor, request),
  openExternal: (url) => ipcRenderer.invoke(ipc.openExternal, url),
  copyText: (text) => ipcRenderer.invoke(ipc.copyText, text),
  onSnapshotUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot): void =>
      listener(snapshot);
    ipcRenderer.on(ipc.snapshotUpdate, handler);
    return () => ipcRenderer.removeListener(ipc.snapshotUpdate, handler);
  },
  onCommandUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: CommandRecord): void =>
      listener(command);
    ipcRenderer.on(ipc.commandUpdate, handler);
    return () => ipcRenderer.removeListener(ipc.commandUpdate, handler);
  },
};

contextBridge.exposeInMainWorld('grafter', api);
