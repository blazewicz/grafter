import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from 'electron';
import path from 'node:path';
import { validateClipboardText } from '../shared/clipboard';
import type {
  AppSnapshot,
  CommandRecord,
  CreateWorktreeRequest,
  EditorTool,
  Settings,
  SwitchBranchRequest,
} from '../shared/contracts';
import { ipc } from '../shared/ipc';
import { AppService } from './services/app-service';
import { CommandRunner } from './commands';
import { editorFileUrl, launchEditor } from './editors';
import { StateStore } from './store';

let mainWindow: BrowserWindow | undefined;
let service: AppService;

function applyMacWindowMaterial(window: BrowserWindow): void {
  if (process.platform !== 'darwin') return;

  const useOpaqueSurface = nativeTheme.prefersReducedTransparency || !window.isFocused();
  window.setBackgroundColor(useOpaqueSurface ? '#151619' : '#00000000');
  window.setVibrancy(useOpaqueSurface ? null : 'menu');
}

function broadcastCommand(command: CommandRecord): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(ipc.commandUpdate, command);
  }
}

function broadcastSnapshot(snapshot: AppSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(ipc.snapshotUpdate, snapshot);
  }
}

async function createWindow(): Promise<void> {
  const useMacVibrancy =
    process.platform === 'darwin' && !nativeTheme.prefersReducedTransparency;
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 790,
    minWidth: 860,
    minHeight: 560,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: useMacVibrancy ? '#00000000' : '#151619',
    ...(useMacVibrancy ? { vibrancy: 'menu' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.on('focus', () => {
    if (mainWindow) applyMacWindowMaterial(mainWindow);
  });
  mainWindow.on('blur', () => {
    if (mainWindow) applyMacWindowMaterial(mainWindow);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

function registerIpc(): void {
  ipcMain.handle(ipc.snapshot, () => service.snapshot());
  ipcMain.handle(ipc.commandLog, (_event, context: unknown) =>
    service.commandLog(context),
  );
  ipcMain.handle(ipc.chooseProject, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose the main Git clone',
      buttonLabel: 'Add project',
      properties: ['openDirectory'],
    });
    const selected = result.filePaths[0];
    return result.canceled || !selected ? null : service.addProject(selected);
  });
  ipcMain.handle(ipc.removeProject, (_event, projectId: string) =>
    service.removeProject(projectId),
  );
  ipcMain.handle(ipc.refresh, () => service.refresh());
  ipcMain.handle(ipc.refreshProject, (_event, projectId: string) =>
    service.refreshProject(projectId),
  );
  ipcMain.handle(ipc.listBranches, (_event, projectId: string) =>
    service.listBranches(projectId),
  );
  ipcMain.handle(ipc.suggestWorktreePath, (_event, projectId: string, branch: string) =>
    service.suggestWorktreePath(projectId, branch),
  );
  ipcMain.handle(ipc.createWorktree, (_event, request: CreateWorktreeRequest) =>
    service.createWorktree(request),
  );
  ipcMain.handle(ipc.switchBranch, (_event, request: SwitchBranchRequest) =>
    service.switchBranch(request),
  );
  ipcMain.handle(ipc.prepareRemove, (_event, worktreeId: string) =>
    service.prepareRemove(worktreeId),
  );
  ipcMain.handle(ipc.approveCommand, (_event, approvalId: string) =>
    service.approve(approvalId),
  );
  ipcMain.handle(ipc.rejectCommand, (_event, approvalId: string) =>
    service.reject(approvalId),
  );
  ipcMain.handle(ipc.worktreeDetails, (_event, worktreeId: string) =>
    service.details(worktreeId),
  );
  ipcMain.handle(ipc.openDiff, (_event, worktreeId: string) =>
    service.openDiff(worktreeId),
  );
  ipcMain.handle(ipc.openBranchDiff, (_event, request: unknown) =>
    service.openBranchDiff(request),
  );
  ipcMain.handle(ipc.openCommitDiff, (_event, request: unknown) =>
    service.openCommitDiff(request),
  );
  ipcMain.handle(ipc.diffFile, (_event, request: unknown) => service.diffFile(request));
  ipcMain.handle(ipc.closeDiff, (_event, sessionId: string) =>
    service.closeDiff(sessionId),
  );
  ipcMain.handle(ipc.refreshPullRequest, (_event, worktreeId: string) =>
    service.refreshPullRequest(worktreeId),
  );
  ipcMain.handle(ipc.worktreeStatus, (_event, worktreeId: string) =>
    service.worktreeStatus(worktreeId),
  );
  ipcMain.handle(ipc.updateSettings, (_event, settings: Settings) =>
    service.updateSettings(settings),
  );
  ipcMain.handle(ipc.updateProjectSetup, (_event, projectId: string, script: string) =>
    service.updateProjectSetup(projectId, script),
  );
  ipcMain.handle(ipc.openWorktreeDirectory, async (_event, worktreeId: string) => {
    const error = await shell.openPath(path.resolve(service.worktreePath(worktreeId)));
    if (error) throw new Error(error);
  });
  ipcMain.handle(
    ipc.openWorktreeInEditor,
    async (_event, worktreeId: string, editor: EditorTool) => {
      await launchEditor(editor, service.worktreePath(worktreeId));
    },
  );
  ipcMain.handle(ipc.openDiffFileInEditor, async (_event, request: unknown) => {
    const target = service.diffFileEditorTarget(request);
    await shell.openExternal(editorFileUrl(target.editor, target.filePath, target.line));
  });
  ipcMain.handle(ipc.openExternal, async (_event, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS links can be opened.');
    await shell.openExternal(parsed.toString());
  });
  ipcMain.handle(ipc.copyText, (_event, text: unknown) => {
    clipboard.writeText(validateClipboardText(text));
  });
}

void app.whenReady().then(async () => {
  const runner = new CommandRunner(broadcastCommand);
  service = new AppService(new StateStore(app.getPath('userData')), runner, {
    homeDirectory: app.getPath('home'),
    systemLocale: app.getSystemLocale(),
    onSnapshotUpdate: broadcastSnapshot,
  });
  await service.initialize();
  registerIpc();
  await createWindow();

  nativeTheme.on('updated', () => {
    for (const window of BrowserWindow.getAllWindows()) {
      applyMacWindowMaterial(window);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
