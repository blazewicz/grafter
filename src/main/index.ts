import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type WebContents,
} from 'electron';
import path from 'node:path';
import { AppService } from './services/app-service';
import { ApplicationRuntime } from './application-runtime';
import { launchEditor } from './editors';
import { registerIpcHandlers, type WindowSessionService } from './ipc-handlers';
import { StateStore } from './store';
import { WindowSessionRegistry } from './window-sessions';

async function createWindow(
  sessions: WindowSessionRegistry<WebContents, BrowserWindow, WindowSessionService>,
  service: AppService,
  runtime: ApplicationRuntime,
): Promise<void> {
  const window = new BrowserWindow({
    width: 1220,
    height: 790,
    minWidth: 860,
    minHeight: 560,
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
  sessions.register({
    window,
    service,
    subscribeToSnapshotUpdates: (subscriber) =>
      service.subscribeToSnapshotUpdates(subscriber),
    subscribeToCommandUpdates: (subscriber) =>
      runtime.subscribeToCommandUpdates(subscriber),
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

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

async function startApplication(): Promise<void> {
  const runtime = new ApplicationRuntime();
  const service = new AppService(new StateStore(app.getPath('userData')), runtime, {
    homeDirectory: app.getPath('home'),
    systemLocale: app.getSystemLocale(),
  });
  const sessions = new WindowSessionRegistry<
    WebContents,
    BrowserWindow,
    WindowSessionService
  >();
  await service.initialize();
  registerIpcHandlers({
    ipcMain,
    sessions,
    dialog,
    shell,
    clipboard,
    launchEditor,
  });
  await createWindow(sessions, service, runtime);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow(sessions, service, runtime).catch((error: unknown) =>
        console.error('Failed to recreate the application window.', error),
      );
    }
  });
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
