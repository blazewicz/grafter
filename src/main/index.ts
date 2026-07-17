import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import type { CommandRecord, CreateWorktreeRequest, Settings } from '../shared/contracts';
import { ipc } from '../shared/ipc';
import { AppService } from './app-service';
import { CommandRunner } from './commands';
import { StateStore } from './store';

let mainWindow: BrowserWindow | undefined;
let service: AppService;

function broadcastCommand(command: CommandRecord): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(ipc.commandUpdate, command);
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 790,
    minWidth: 860,
    minHeight: 560,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#151619',
    ...(process.platform === 'darwin' ? { vibrancy: 'under-window' as const } : {}),
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
  ipcMain.handle(ipc.listBranches, (_event, projectId: string) =>
    service.listBranches(projectId),
  );
  ipcMain.handle(ipc.suggestWorktreePath, (_event, projectId: string, branch: string) =>
    service.suggestWorktreePath(projectId, branch),
  );
  ipcMain.handle(ipc.createWorktree, (_event, request: CreateWorktreeRequest) =>
    service.createWorktree(request),
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
  ipcMain.handle(ipc.worktreeStatus, (_event, worktreeId: string) =>
    service.worktreeStatus(worktreeId),
  );
  ipcMain.handle(ipc.updateSettings, (_event, settings: Settings) =>
    service.updateSettings(settings),
  );
  ipcMain.handle(ipc.updateProjectSetup, (_event, projectId: string, script: string) =>
    service.updateProjectSetup(projectId, script),
  );
  ipcMain.handle(ipc.revealPath, (_event, itemPath: string) => {
    shell.showItemInFolder(path.resolve(itemPath));
  });
  ipcMain.handle(ipc.openExternal, async (_event, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS links can be opened.');
    await shell.openExternal(parsed.toString());
  });
}

void app.whenReady().then(async () => {
  const runner = new CommandRunner(broadcastCommand);
  service = new AppService(new StateStore(app.getPath('userData')), runner);
  await service.initialize();
  registerIpc();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
