import { contextBridge, ipcRenderer } from 'electron';
import type {
  CommandContext,
  CommandRecord,
  CreateWorktreeRequest,
  GrafterApi,
  Settings,
} from '../shared/contracts';
import { ipc } from '../shared/ipc';

const api: GrafterApi = {
  getSnapshot: () => ipcRenderer.invoke(ipc.snapshot),
  getCommandLog: (context: CommandContext) => ipcRenderer.invoke(ipc.commandLog, context),
  chooseProject: () => ipcRenderer.invoke(ipc.chooseProject),
  removeProject: (projectId) => ipcRenderer.invoke(ipc.removeProject, projectId),
  refresh: () => ipcRenderer.invoke(ipc.refresh),
  listBranches: (projectId) => ipcRenderer.invoke(ipc.listBranches, projectId),
  suggestWorktreePath: (projectId, branch) =>
    ipcRenderer.invoke(ipc.suggestWorktreePath, projectId, branch),
  createWorktree: (request: CreateWorktreeRequest) =>
    ipcRenderer.invoke(ipc.createWorktree, request),
  prepareRemoveWorktree: (worktreeId) =>
    ipcRenderer.invoke(ipc.prepareRemove, worktreeId),
  approveCommand: (approvalId) => ipcRenderer.invoke(ipc.approveCommand, approvalId),
  rejectCommand: (approvalId) => ipcRenderer.invoke(ipc.rejectCommand, approvalId),
  getWorktreeDetails: (worktreeId) => ipcRenderer.invoke(ipc.worktreeDetails, worktreeId),
  getWorktreeStatus: (worktreeId) => ipcRenderer.invoke(ipc.worktreeStatus, worktreeId),
  updateSettings: (settings: Settings) =>
    ipcRenderer.invoke(ipc.updateSettings, settings),
  updateProjectSetup: (projectId, script) =>
    ipcRenderer.invoke(ipc.updateProjectSetup, projectId, script),
  openWorktreeDirectory: (worktreeId) =>
    ipcRenderer.invoke(ipc.openWorktreeDirectory, worktreeId),
  openWorktreeInEditor: (worktreeId, editor) =>
    ipcRenderer.invoke(ipc.openWorktreeInEditor, worktreeId, editor),
  openExternal: (url) => ipcRenderer.invoke(ipc.openExternal, url),
  copyCommand: (command) => ipcRenderer.invoke(ipc.copyCommand, command),
  onCommandUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: CommandRecord): void =>
      listener(command);
    ipcRenderer.on(ipc.commandUpdate, handler);
    return () => ipcRenderer.removeListener(ipc.commandUpdate, handler);
  },
};

contextBridge.exposeInMainWorld('grafter', api);
