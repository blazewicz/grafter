import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import {
  registerIpcHandlers,
  type WindowSessionService,
} from '../../src/main/ipc-handlers';
import { ipc } from '../../src/shared/ipc';
import type { WindowSessionRegistry } from '../../src/main/window-sessions';
import { appSnapshotFactory } from '../factories';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Sessions = WindowSessionRegistry<WebContents, BrowserWindow, WindowSessionService>;

interface Harness {
  handlers: Map<string, Handler>;
  resolve: ReturnType<typeof vi.fn>;
  showOpenDialog: ReturnType<typeof vi.fn>;
  openPath: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
  writeText: ReturnType<typeof vi.fn>;
  launchEditor: ReturnType<typeof vi.fn>;
  openRepository: ReturnType<typeof vi.fn>;
  openRecentRepository: ReturnType<typeof vi.fn>;
  removeRepository: ReturnType<typeof vi.fn>;
}

function createHarness(
  resolveSession: (sender: WebContents) => {
    service: WindowSessionService;
    dialogParent: BrowserWindow;
  },
): Harness {
  const handlers = new Map<string, Handler>();
  const handle = vi.fn((channel: string, handler: Handler) => {
    if (handlers.has(channel)) throw new Error(`Duplicate handler: ${channel}`);
    handlers.set(channel, handler);
  });
  const resolve = vi.fn(resolveSession);
  const showOpenDialog = vi.fn().mockResolvedValue({ canceled: true, filePaths: [] });
  const openPath = vi.fn().mockResolvedValue('');
  const openExternal = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn();
  const launchEditor = vi.fn().mockResolvedValue(undefined);
  const openRepository = vi.fn().mockResolvedValue(undefined);
  const openRecentRepository = vi.fn().mockResolvedValue(undefined);
  const removeRepository = vi.fn().mockResolvedValue(undefined);

  registerIpcHandlers({
    ipcMain: { handle },
    sessions: { resolve } as unknown as Sessions,
    windowManager: { openRepository, openRecentRepository, removeRepository },
    dialog: { showOpenDialog },
    shell: { openPath, openExternal },
    clipboard: { writeText },
    launchEditor,
  });

  return {
    handlers,
    resolve,
    showOpenDialog,
    openPath,
    openExternal,
    writeText,
    launchEditor,
    openRepository,
    openRecentRepository,
    removeRepository,
  };
}

function invoke(
  harness: Harness,
  channel: string,
  sender: WebContents,
  ...args: unknown[]
): unknown {
  const handler = harness.handlers.get(channel);
  if (!handler) throw new Error(`Missing handler: ${channel}`);
  return handler({ sender } as IpcMainInvokeEvent, ...args);
}

function serviceStub(methods: Partial<WindowSessionService>): WindowSessionService {
  return methods as WindowSessionService;
}

describe('registerIpcHandlers', () => {
  it('registers once and resolves the sender before every inbound IPC operation', async () => {
    const service = new Proxy(
      {},
      {
        get: () => vi.fn(),
      },
    ) as WindowSessionService;
    const window = {} as BrowserWindow;
    const harness = createHarness(() => ({ service, dialogParent: window }));
    const sender = {} as WebContents;
    const inboundChannels = Object.values(ipc).filter(
      (channel) => channel !== ipc.snapshotUpdate && channel !== ipc.commandUpdate,
    );

    expect(harness.handlers.size).toBe(inboundChannels.length);
    for (const channel of inboundChannels) {
      try {
        await invoke(harness, channel, sender);
      } catch {
        // Invalid placeholder arguments may fail after sender resolution.
      }
    }

    expect(harness.resolve).toHaveBeenCalledTimes(inboundChannels.length);
    expect(harness.resolve.mock.calls.every(([value]) => value === sender)).toBe(true);
  });

  it('keeps service authority scoped to the invoking sender', () => {
    const firstSender = {} as WebContents;
    const secondSender = {} as WebContents;
    const firstSnapshot = appSnapshotFactory.build({ homeDirectory: '/first' });
    const secondSnapshot = appSnapshotFactory.build({ homeDirectory: '/second' });
    const firstSnapshotMethod = vi.fn(() => firstSnapshot);
    const secondSnapshotMethod = vi.fn(() => secondSnapshot);
    const firstService = serviceStub({ snapshot: firstSnapshotMethod });
    const secondService = serviceStub({ snapshot: secondSnapshotMethod });
    const firstWindow = {} as BrowserWindow;
    const secondWindow = {} as BrowserWindow;
    const harness = createHarness((sender) =>
      sender === firstSender
        ? { service: firstService, dialogParent: firstWindow }
        : { service: secondService, dialogParent: secondWindow },
    );

    expect(invoke(harness, ipc.snapshot, firstSender)).toBe(firstSnapshot);
    expect(invoke(harness, ipc.snapshot, secondSender)).toBe(secondSnapshot);
    expect(firstSnapshotMethod).toHaveBeenCalledOnce();
    expect(secondSnapshotMethod).toHaveBeenCalledOnce();
  });

  it('parents the repository dialog to the invoking session window', async () => {
    const sender = {} as WebContents;
    const window = {} as BrowserWindow;
    const harness = createHarness(() => ({
      service: serviceStub({}),
      dialogParent: window,
    }));
    harness.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/repository'],
    });

    await invoke(harness, ipc.chooseProject, sender);

    expect(harness.showOpenDialog).toHaveBeenCalledWith(window, {
      title: 'Open a Git repository or worktree',
      buttonLabel: 'Open Repository',
      properties: ['openDirectory'],
    });
    expect(harness.openRepository).toHaveBeenCalledWith(sender, '/repository');
  });

  it('preserves approval, URL, and clipboard validation behind session resolution', async () => {
    const sender = {} as WebContents;
    const window = {} as BrowserWindow;
    const approve = vi.fn();
    const harness = createHarness(() => ({
      service: serviceStub({ approve }),
      dialogParent: window,
    }));

    invoke(harness, ipc.approveCommand, sender, 'approval-id');
    await invoke(harness, ipc.openExternal, sender, 'https://example.com/path');
    invoke(harness, ipc.copyText, sender, 'safe text');

    expect(approve).toHaveBeenCalledWith('approval-id');
    expect(harness.openExternal).toHaveBeenCalledWith('https://example.com/path');
    expect(harness.writeText).toHaveBeenCalledWith('safe text');
    await expect(
      invoke(harness, ipc.openExternal, sender, 'file:///etc/passwd'),
    ).rejects.toThrow('Only HTTPS links can be opened.');
    expect(() => invoke(harness, ipc.copyText, sender, 42)).toThrow(
      'Invalid clipboard text.',
    );
  });

  it('rejects unknown senders before any privileged boundary is reached', async () => {
    const unavailable = new Error('Window session is not available for this sender.');
    const harness = createHarness(() => {
      throw unavailable;
    });
    const sender = {} as WebContents;

    await expect(
      invoke(harness, ipc.openExternal, sender, 'https://example.com'),
    ).rejects.toThrow(unavailable);
    expect(() => invoke(harness, ipc.copyText, sender, 'text')).toThrow(unavailable);
    expect(harness.openExternal).not.toHaveBeenCalled();
    expect(harness.writeText).not.toHaveBeenCalled();
  });
});
