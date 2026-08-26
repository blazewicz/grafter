import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import path from 'node:path';
import { ApplicationRuntime } from './application-runtime';
import { launchEditor } from './editors';
import { registerIpcHandlers } from './ipc-handlers';
import { openRepositoryFromNativeMenu } from './native-open-repository';
import { StateStore } from './store';
import { launchTerminal } from './terminal';
import { WindowManager } from './window-manager';
import type { WindowKind } from './window-manager';
import type { WindowSessionService } from './window-session-services';
import { WindowSessionRegistry } from './window-sessions';

const windowSurfaces: Record<WindowKind, { page: string }> = {
  app: { page: 'index.html' },
  diff: { page: 'index.diff.html' },
};

function createBrowserWindow(kind: WindowKind): BrowserWindow {
  const isDiff = kind === 'diff';
  const window = new BrowserWindow({
    width: isDiff ? 960 : 1220,
    height: isDiff ? 640 : 790,
    minWidth: isDiff ? 720 : 860,
    minHeight: isDiff ? 420 : 560,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 30, y: 20 },
    backgroundColor: '#141517',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell
        .openExternal(url)
        .catch((error: unknown) =>
          console.error(`Failed to open external URL: ${url}`, error),
        );
    }
    return { action: 'deny' };
  });
  return window;
}

async function loadBrowserWindow(window: BrowserWindow, kind: WindowKind): Promise<void> {
  const { page } = windowSurfaces[kind];
  const devServerUrl =
    kind === 'diff' ? DIFF_WINDOW_VITE_DEV_SERVER_URL : MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const prodName = kind === 'diff' ? DIFF_WINDOW_VITE_NAME : MAIN_WINDOW_VITE_NAME;
  if (devServerUrl) {
    await window.loadURL(`${devServerUrl.replace(/\/?$/, '/')}${page}`);
    return;
  }
  await window.loadFile(path.join(__dirname, `../renderer/${prodName}/${page}`));
}

async function startApplication(): Promise<void> {
  const runtime = new ApplicationRuntime();
  const store = new StateStore(app.getPath('userData'));
  await store.load();
  const sessions = new WindowSessionRegistry<
    WebContents,
    BrowserWindow,
    WindowSessionService
  >();
  const windowManager = new WindowManager({
    store,
    runtime,
    sessions,
    createWindow: createBrowserWindow,
    loadWindow: loadBrowserWindow,
    homeDirectory: app.getPath('home'),
    systemLocale: app.getSystemLocale(),
  });

  registerIpcHandlers({
    ipcMain,
    sessions,
    windowManager,
    dialog,
    shell,
    clipboard,
    launchEditor,
    launchTerminal,
  });
  Menu.setApplicationMenu(
    buildApplicationMenu(() => {
      void openRepositoryFromNativeMenu({
        getFocusedWindow: () => BrowserWindow.getFocusedWindow(),
        getAllWindows: () => BrowserWindow.getAllWindows(),
        ensureWelcomeWindow: () => windowManager.ensureWelcomeWindow(),
        showOpenDialog: (window) =>
          dialog.showOpenDialog(window, {
            title: 'Open a Git repository or worktree',
            buttonLabel: 'Open Repository',
            properties: ['openDirectory'],
          }),
        showOpenError: (window, detail) =>
          dialog.showMessageBox(window, {
            type: 'error',
            title: 'Unable to Open Repository',
            message: 'The selected folder could not be opened as a Git repository.',
            detail,
          }),
        openRepositoryFromWindow: (window, selectedPath) =>
          windowManager.openRepositoryFromWindow(window, selectedPath),
        logError: (message, error) => console.error(message, error),
      });
    }),
  );
  await windowManager.ensureWelcomeWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void windowManager
        .ensureWelcomeWindow()
        .catch((error: unknown) =>
          console.error('Failed to recreate the welcome window.', error),
        );
    }
  });
}

function buildApplicationMenu(onOpenRepository: () => void): Menu {
  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'Open Repository...',
        accelerator: 'CmdOrCtrl+O',
        click: onOpenRepository,
      },
      { type: 'separator' },
      { role: 'close' },
    ],
  };
  const template: MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
          fileMenu,
          { role: 'editMenu' },
          { role: 'windowMenu' },
        ]
      : [fileMenu, { role: 'editMenu' }, { role: 'windowMenu' }];
  return Menu.buildFromTemplate(template);
}

void app
  .whenReady()
  .then(startApplication)
  .catch((error: unknown) => {
    console.error('Failed to start Grafter.', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
