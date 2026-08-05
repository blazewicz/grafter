import path from 'node:path';
import type {
  BrowserWindow,
  Clipboard,
  Dialog,
  IpcMain,
  Shell,
  WebContents,
} from 'electron';
import { validateClipboardText } from '../shared/clipboard';
import type {
  CreateWorktreeRequest,
  EditorTool,
  Settings,
  SwitchBranchRequest,
} from '../shared/contracts';
import { ipc } from '../shared/ipc';
import { editorFileUrl } from './editors';
import type { WindowSessionService } from './window-session-services';
import type { WindowSessionRegistry } from './window-sessions';

export type { WindowSessionService } from './window-session-services';

type Sessions = WindowSessionRegistry<WebContents, BrowserWindow, WindowSessionService>;

interface IpcHandlerDependencies {
  ipcMain: Pick<IpcMain, 'handle'>;
  sessions: Sessions;
  windowManager: {
    openRepository(sender: WebContents, selectedPath: string): Promise<unknown>;
    openRecentRepository(sender: WebContents, repositoryId: string): Promise<unknown>;
  };
  dialog: Pick<Dialog, 'showOpenDialog'>;
  shell: Pick<Shell, 'openPath' | 'openExternal'>;
  clipboard: Pick<Clipboard, 'writeText'>;
  launchEditor: (editor: EditorTool, directoryPath: string) => Promise<void>;
}

export function registerIpcHandlers(dependencies: IpcHandlerDependencies): void {
  const { ipcMain, sessions, windowManager, dialog, shell, clipboard, launchEditor } =
    dependencies;

  ipcMain.handle(ipc.snapshot, (event) =>
    sessions.resolve(event.sender).service.snapshot(),
  );
  ipcMain.handle(ipc.commandLog, (event, context: unknown) =>
    sessions.resolve(event.sender).service.commandLog(context),
  );
  ipcMain.handle(ipc.chooseRepository, async (event) => {
    const session = sessions.resolve(event.sender);
    const result = await dialog.showOpenDialog(session.dialogParent, {
      title: 'Open a Git repository or worktree',
      buttonLabel: 'Open Repository',
      properties: ['openDirectory'],
    });
    const selected = result.filePaths[0];
    return result.canceled || !selected
      ? null
      : windowManager.openRepository(event.sender, selected);
  });
  ipcMain.handle(ipc.openRecentRepository, (event, repositoryId: string) => {
    sessions.resolve(event.sender);
    return windowManager.openRecentRepository(event.sender, repositoryId);
  });
  ipcMain.handle(ipc.refresh, (event) =>
    sessions.resolve(event.sender).service.refresh(),
  );
  ipcMain.handle(ipc.listBranches, (event) =>
    sessions.resolve(event.sender).service.listBranches(),
  );
  ipcMain.handle(ipc.suggestWorktreePath, (event, branch: string) =>
    sessions.resolve(event.sender).service.suggestWorktreePath(branch),
  );
  ipcMain.handle(ipc.createWorktree, (event, request: CreateWorktreeRequest) =>
    sessions.resolve(event.sender).service.createWorktree(request),
  );
  ipcMain.handle(ipc.switchBranch, (event, request: SwitchBranchRequest) =>
    sessions.resolve(event.sender).service.switchBranch(request),
  );
  ipcMain.handle(ipc.prepareRemove, (event, worktreeId: string) =>
    sessions.resolve(event.sender).service.prepareRemove(worktreeId),
  );
  ipcMain.handle(ipc.approveCommand, (event, approvalId: string) =>
    sessions.resolve(event.sender).service.approve(approvalId),
  );
  ipcMain.handle(ipc.rejectCommand, (event, approvalId: string) =>
    sessions.resolve(event.sender).service.reject(approvalId),
  );
  ipcMain.handle(ipc.worktreeDetails, (event, worktreeId: string) =>
    sessions.resolve(event.sender).service.details(worktreeId),
  );
  ipcMain.handle(ipc.setComparisonBase, (event, request: unknown) =>
    sessions.resolve(event.sender).service.setComparisonBase(request),
  );
  ipcMain.handle(ipc.listBranchCommits, (event, request: unknown) =>
    sessions.resolve(event.sender).service.listBranchCommits(request),
  );
  ipcMain.handle(ipc.openDiff, (event, worktreeId: string) =>
    sessions.resolve(event.sender).service.openDiff(worktreeId),
  );
  ipcMain.handle(ipc.openBranchDiff, (event, request: unknown) =>
    sessions.resolve(event.sender).service.openBranchDiff(request),
  );
  ipcMain.handle(ipc.openCommitDiff, (event, request: unknown) =>
    sessions.resolve(event.sender).service.openCommitDiff(request),
  );
  ipcMain.handle(ipc.diffFile, (event, request: unknown) =>
    sessions.resolve(event.sender).service.diffFile(request),
  );
  ipcMain.handle(ipc.closeDiff, (event, sessionId: string) =>
    sessions.resolve(event.sender).service.closeDiff(sessionId),
  );
  ipcMain.handle(ipc.refreshPullRequest, (event, worktreeId: string) =>
    sessions.resolve(event.sender).service.refreshPullRequest(worktreeId),
  );
  ipcMain.handle(ipc.worktreeStatus, (event, worktreeId: string) =>
    sessions.resolve(event.sender).service.worktreeStatus(worktreeId),
  );
  ipcMain.handle(ipc.updateSettings, (event, settings: Settings) =>
    sessions.resolve(event.sender).service.updateSettings(settings),
  );
  ipcMain.handle(ipc.updateRepositorySetup, (event, script: string) =>
    sessions.resolve(event.sender).service.updateRepositorySetup(script),
  );
  ipcMain.handle(ipc.openWorktreeDirectory, async (event, worktreeId: string) => {
    const service = sessions.resolve(event.sender).service;
    const error = await shell.openPath(path.resolve(service.worktreePath(worktreeId)));
    if (error) throw new Error(error);
  });
  ipcMain.handle(
    ipc.openWorktreeInEditor,
    async (event, worktreeId: string, editor: EditorTool) => {
      const service = sessions.resolve(event.sender).service;
      await launchEditor(editor, service.worktreePath(worktreeId));
    },
  );
  ipcMain.handle(ipc.openDiffFileInEditor, async (event, request: unknown) => {
    const service = sessions.resolve(event.sender).service;
    const target = service.diffFileEditorTarget(request);
    await shell.openExternal(editorFileUrl(target.editor, target.filePath, target.line));
  });
  ipcMain.handle(ipc.openExternal, async (event, url: string) => {
    sessions.resolve(event.sender);
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS links can be opened.');
    await shell.openExternal(parsed.toString());
  });
  ipcMain.handle(ipc.copyText, (event, text: unknown) => {
    sessions.resolve(event.sender);
    clipboard.writeText(validateClipboardText(text));
  });
}
