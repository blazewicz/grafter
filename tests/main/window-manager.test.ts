import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRuntime } from '../../src/main/application-runtime';
import type { RepositoryLocation } from '../../src/main/services/repository-locator';
import { RepositoryService } from '../../src/main/services/repository-service';
import { StateStore } from '../../src/main/store';
import { WindowManager } from '../../src/main/window-manager';
import {
  WelcomeWindowSession,
  type WindowSessionService,
} from '../../src/main/window-session-services';
import {
  WindowSessionRegistry,
  type WindowSessionSender,
  type WindowSessionWindow,
} from '../../src/main/window-sessions';
import type {
  AppSnapshot,
  ProjectConfig,
  RepositoryWindowSnapshot,
  WelcomeWindowSnapshot,
} from '../../src/shared/contracts';
import { ipc } from '../../src/shared/ipc';
import { settingsFactory } from '../factories';
import { StubCommandRunner } from './support/stub-command-runner';

class FakeSender extends EventEmitter implements WindowSessionSender {
  destroyed = false;
  readonly sent: { channel: string; value: unknown }[] = [];

  isDestroyed(): boolean {
    return this.destroyed;
  }

  send(channel: string, value: unknown): void {
    this.sent.push({ channel, value });
  }
}

class FakeWindow extends EventEmitter implements WindowSessionWindow<FakeSender> {
  destroyed = false;
  focusCalls = 0;

  constructor(readonly webContents = new FakeSender()) {
    super();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  focus(): void {
    this.focusCalls += 1;
  }

  close(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.webContents.destroyed = true;
    this.emit('closed');
    this.webContents.emit('destroyed');
  }
}

interface Harness {
  manager: WindowManager<FakeSender, FakeWindow>;
  sessions: WindowSessionRegistry<FakeSender, FakeWindow, WindowSessionService>;
  store: StateStore;
  runtime: ApplicationRuntime;
  windows: FakeWindow[];
  services: RepositoryService[];
  runner: StubCommandRunner;
}

function createHarness(
  locations: Map<string, RepositoryLocation>,
  options: {
    locate?: (selectedPath: string) => Promise<RepositoryLocation>;
    onCommand?: (
      tool: string,
      args: readonly string[],
      cwd: string,
    ) =>
      | Promise<{ stdout?: string; exitCode?: number }>
      | { stdout?: string; exitCode?: number };
  } = {},
): Harness {
  const store = new StateStore('/unused', { persist: () => Promise.resolve() });
  const runner = new StubCommandRunner((spec) => {
    if (options.onCommand) {
      return options.onCommand(spec.tool, spec.args, spec.cwd);
    }
    if (spec.tool === 'git' && spec.args[0] === 'worktree') {
      return { stdout: repositoryWorktreeOutput(locations, spec.cwd) };
    }
    if (spec.tool === 'git' && spec.args[0] === 'status') {
      return { stdout: '' };
    }
    if (spec.tool === 'github') return { exitCode: 1 };
    throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
  });
  const runtime = new ApplicationRuntime({ commandRunner: runner });
  const sessions = new WindowSessionRegistry<
    FakeSender,
    FakeWindow,
    WindowSessionService
  >();
  const windows: FakeWindow[] = [];
  const services: RepositoryService[] = [];
  let repositorySequence = 0;
  const manager = new WindowManager({
    store,
    runtime,
    sessions,
    createWindow: () => {
      const window = new FakeWindow();
      windows.push(window);
      return window;
    },
    loadWindow: () => Promise.resolve(),
    homeDirectory: '/Users/developer',
    systemLocale: 'en-GB',
    locator: {
      locate:
        options.locate ??
        ((selectedPath) => {
          const location = locations.get(selectedPath);
          return location
            ? Promise.resolve(location)
            : Promise.reject(new Error(`Missing repository: ${selectedPath}`));
        }),
    },
    createRepositoryId: () => `repository-${++repositorySequence}`,
    createRepositoryService: (project, canonicalRepositoryKey) => {
      const service = new RepositoryService(
        project,
        canonicalRepositoryKey,
        store,
        runtime,
      );
      services.push(service);
      return service;
    },
  });
  return { manager, sessions, store, runtime, windows, services, runner };
}

function repositoryLocation(name: string, selected = 'main'): RepositoryLocation {
  const mainWorktreePath = `/repositories/${name}`;
  return {
    name,
    commonDirectoryPath: `${mainWorktreePath}/.git`,
    mainWorktreePath,
    selectedWorktreePath:
      selected === 'main'
        ? mainWorktreePath
        : `${mainWorktreePath}.worktrees/${selected}`,
  };
}

function worktreeOutput(location: RepositoryLocation): string {
  const main = `worktree ${location.mainWorktreePath}\nHEAD 1111111\nbranch refs/heads/main`;
  if (location.selectedWorktreePath === location.mainWorktreePath) return `${main}\n`;
  return `${main}\n\nworktree ${location.selectedWorktreePath}\nHEAD 2222222\nbranch refs/heads/feature\n`;
}

function repositoryWorktreeOutput(
  locations: ReadonlyMap<string, RepositoryLocation>,
  repositoryPath: string,
): string {
  const matching = [...locations.values()].filter(
    (candidate) => candidate.mainWorktreePath === repositoryPath,
  );
  const first = matching[0];
  if (!first) throw new Error(`Unexpected repository: ${repositoryPath}`);
  const linkedPaths = [
    ...new Set(
      matching
        .map((candidate) => candidate.selectedWorktreePath)
        .filter((candidate) => candidate !== repositoryPath),
    ),
  ];
  const main = `worktree ${repositoryPath}\nHEAD 1111111\nbranch refs/heads/main`;
  return [
    main,
    ...linkedPaths.map(
      (linkedPath, index) =>
        `worktree ${linkedPath}\nHEAD ${String(index + 2).repeat(7)}\nbranch refs/heads/feature`,
    ),
  ].join('\n\n');
}

function snapshot(harness: Harness, window: FakeWindow) {
  return harness.sessions.resolve(window.webContents).service.snapshot();
}

function repositorySnapshot(
  harness: Harness,
  window: FakeWindow,
): RepositoryWindowSnapshot {
  return expectRepositorySnapshot(snapshot(harness, window));
}

function welcomeSnapshot(harness: Harness, window: FakeWindow): WelcomeWindowSnapshot {
  return expectWelcomeSnapshot(snapshot(harness, window));
}

function expectWelcomeSnapshot(value: AppSnapshot): WelcomeWindowSnapshot {
  if (value.kind !== 'welcome') throw new Error('Expected a welcome snapshot.');
  return value;
}

function expectRepositorySnapshot(value: AppSnapshot): RepositoryWindowSnapshot {
  if (value.kind !== 'repository') throw new Error('Expected a repository snapshot.');
  return value;
}

describe('WindowManager', () => {
  it('creates an initial welcome without restoring persisted repositories', async () => {
    const location = repositoryLocation('persisted');
    const harness = createHarness(new Map([[location.selectedWorktreePath, location]]));
    const project: ProjectConfig = {
      id: 'persisted-id',
      name: location.name,
      path: location.mainWorktreePath,
    };
    await harness.store.addRepository(
      project,
      location.selectedWorktreePath,
      location.commonDirectoryPath,
    );

    const window = await harness.manager.ensureWelcomeWindow();

    expect(harness.windows).toEqual([window]);
    expect(welcomeSnapshot(harness, window)).toMatchObject({
      kind: 'welcome',
      recentRepositories: [{ repositoryId: project.id }],
    });
    expect(harness.runner.commands).toEqual([]);
  });

  it('reuses a welcome window and selects the linked worktree', async () => {
    const location = repositoryLocation('alpha', 'feature');
    const harness = createHarness(new Map([[location.selectedWorktreePath, location]]));
    const welcome = await harness.manager.ensureWelcomeWindow();

    const opened = await harness.manager.openRepository(
      welcome.webContents,
      location.selectedWorktreePath,
    );

    expect(harness.windows).toEqual([welcome]);
    const openedRepository = expectRepositorySnapshot(opened);
    expect(openedRepository.repository.path).toBe(location.mainWorktreePath);
    expect(
      openedRepository.repository.worktrees.find(
        (worktree) => worktree.id === openedRepository.selectedWorktreeId,
      )?.path,
    ).toBe(location.selectedWorktreePath);
  });

  it('opens a different repository in a new isolated window', async () => {
    const alpha = repositoryLocation('alpha');
    const beta = repositoryLocation('beta');
    const harness = createHarness(
      new Map([
        [alpha.selectedWorktreePath, alpha],
        [beta.selectedWorktreePath, beta],
      ]),
    );
    const firstWindow = await harness.manager.ensureWelcomeWindow();
    await harness.manager.openRepository(firstWindow.webContents, alpha.mainWorktreePath);

    const invokingSnapshot = await harness.manager.openRepository(
      firstWindow.webContents,
      beta.mainWorktreePath,
    );
    const secondWindow = harness.windows[1];
    if (!secondWindow) throw new Error('Expected a second repository window.');

    expect(expectRepositorySnapshot(invokingSnapshot).repository.name).toBe('alpha');
    expect(repositorySnapshot(harness, firstWindow).repository.name).toBe('alpha');
    expect(repositorySnapshot(harness, secondWindow).repository.name).toBe('beta');
  });

  it('publishes successful global settings updates to every live window session', async () => {
    const alpha = repositoryLocation('alpha');
    const beta = repositoryLocation('beta');
    const harness = createHarness(
      new Map([
        [alpha.selectedWorktreePath, alpha],
        [beta.selectedWorktreePath, beta],
      ]),
    );
    const alphaWindow = await harness.manager.ensureWelcomeWindow();
    await harness.manager.openRepository(alphaWindow.webContents, alpha.mainWorktreePath);
    await harness.manager.openRepository(alphaWindow.webContents, beta.mainWorktreePath);
    const betaWindow = harness.windows[1];
    if (!betaWindow) throw new Error('Expected a second repository window.');

    const welcomeWindow = new FakeWindow();
    const welcomeService = new WelcomeWindowSession(harness.store, {
      homeDirectory: '/Users/developer',
      systemLocale: 'en-GB',
    });
    const disposeWelcomeRegistration = harness.sessions.register({
      window: welcomeWindow,
      service: welcomeService,
      subscribeToSnapshotUpdates: (subscriber) =>
        welcomeService.subscribeToSnapshotUpdates(subscriber),
      subscribeToCommandUpdates: (subscriber) =>
        welcomeService.subscribeToCommandUpdates(subscriber),
    });
    const disposedWindow = new FakeWindow();
    const disposedService = new WelcomeWindowSession(harness.store, {
      homeDirectory: '/Users/developer',
      systemLocale: 'en-GB',
    });
    const disposeClosedRegistration = harness.sessions.register({
      window: disposedWindow,
      service: disposedService,
      subscribeToSnapshotUpdates: (subscriber) =>
        disposedService.subscribeToSnapshotUpdates(subscriber),
      subscribeToCommandUpdates: (subscriber) =>
        disposedService.subscribeToCommandUpdates(subscriber),
    });
    disposeClosedRegistration();
    disposedService.dispose();

    await vi.waitFor(() => {
      for (const window of [alphaWindow, betaWindow]) {
        const worktrees = repositorySnapshot(harness, window).repository.worktrees;
        expect(worktrees.every((worktree) => worktree.status !== undefined)).toBe(true);
      }
    });
    const alphaRepository = repositorySnapshot(harness, alphaWindow).repository;
    const betaRepository = repositorySnapshot(harness, betaWindow).repository;
    alphaWindow.webContents.sent.splice(0);
    betaWindow.webContents.sent.splice(0);
    welcomeWindow.webContents.sent.splice(0);
    const settings = settingsFactory.build({
      defaultWorktreePath: '  /worktrees/<repo_name>  ',
    });

    const result = await harness.manager.updateSettings(
      alphaWindow.webContents,
      settings,
    );

    expect(expectRepositorySnapshot(result).settings.defaultWorktreePath).toBe(
      '/worktrees/<repo_name>',
    );
    for (const window of [alphaWindow, betaWindow, welcomeWindow]) {
      expect(window.webContents.sent).toHaveLength(1);
      expect(window.webContents.sent[0]).toMatchObject({
        channel: ipc.snapshotUpdate,
        value: { settings: { defaultWorktreePath: '/worktrees/<repo_name>' } },
      });
    }
    expect(repositorySnapshot(harness, alphaWindow).repository).toEqual(alphaRepository);
    expect(repositorySnapshot(harness, betaWindow).repository).toEqual(betaRepository);
    expect(
      expectWelcomeSnapshot(welcomeService.snapshot()).recentRepositories,
    ).toHaveLength(2);
    expect(disposedWindow.webContents.sent).toEqual([]);

    disposeWelcomeRegistration();
    welcomeService.dispose();
  });

  it('deduplicates simultaneous opens of one canonical repository', async () => {
    const location = repositoryLocation('alpha');
    const releaseLocate = deferred<RepositoryLocation>();
    let locateCalls = 0;
    const harness = createHarness(new Map([[location.mainWorktreePath, location]]), {
      locate: async () => {
        locateCalls += 1;
        if (locateCalls === 1) return releaseLocate.promise;
        return location;
      },
    });
    const welcome = await harness.manager.ensureWelcomeWindow();

    const first = harness.manager.openRepository(
      welcome.webContents,
      location.mainWorktreePath,
    );
    const second = harness.manager.openRepository(
      welcome.webContents,
      location.mainWorktreePath,
    );
    await Promise.resolve();
    releaseLocate.resolve(location);
    await Promise.all([first, second]);

    expect(harness.windows).toHaveLength(1);
    expect(harness.services).toHaveLength(1);
    expect(repositorySnapshot(harness, welcome).repository.name).toBe('alpha');
  });

  it('focuses an existing repository window and hands off linked-worktree selection', async () => {
    const alphaMain = repositoryLocation('alpha');
    const alphaLinked = repositoryLocation('alpha', 'feature');
    const beta = repositoryLocation('beta');
    const harness = createHarness(
      new Map([
        [alphaMain.selectedWorktreePath, alphaMain],
        [alphaLinked.selectedWorktreePath, alphaLinked],
        [beta.selectedWorktreePath, beta],
      ]),
    );
    const alphaWindow = await harness.manager.ensureWelcomeWindow();
    await harness.manager.openRepository(
      alphaWindow.webContents,
      alphaMain.mainWorktreePath,
    );
    await harness.manager.openRepository(alphaWindow.webContents, beta.mainWorktreePath);
    const betaWindow = harness.windows[1];
    if (!betaWindow) throw new Error('Expected a beta window.');
    const focusCalls = alphaWindow.focusCalls;

    const betaSnapshot = await harness.manager.openRepository(
      betaWindow.webContents,
      alphaLinked.selectedWorktreePath,
    );
    const alphaSnapshot = repositorySnapshot(harness, alphaWindow);

    expect(harness.windows).toHaveLength(2);
    expect(alphaWindow.focusCalls).toBe(focusCalls + 1);
    expect(expectRepositorySnapshot(betaSnapshot).repository.name).toBe('beta');
    expect(
      alphaSnapshot.repository.worktrees.find(
        (worktree) => worktree.id === alphaSnapshot.selectedWorktreeId,
      )?.path,
    ).toBe(alphaLinked.selectedWorktreePath);
  });

  it('validates recents lazily and recovers in the same welcome window', async () => {
    const missing = repositoryLocation('missing');
    const valid = repositoryLocation('valid');
    const harness = createHarness(new Map([[valid.mainWorktreePath, valid]]), {
      locate: (selectedPath) => {
        if (selectedPath === missing.mainWorktreePath) {
          return Promise.reject(new Error('The selected folder does not exist.'));
        }
        return Promise.resolve(valid);
      },
    });
    await harness.store.addRepository(
      { id: 'missing-id', name: missing.name, path: missing.mainWorktreePath },
      missing.mainWorktreePath,
      missing.commonDirectoryPath,
    );
    const welcome = await harness.manager.ensureWelcomeWindow();

    await expect(
      harness.manager.openRecentRepository(welcome.webContents, 'missing-id'),
    ).rejects.toThrow('does not exist');
    expect(welcomeSnapshot(harness, welcome).kind).toBe('welcome');

    await harness.manager.openRepository(welcome.webContents, valid.mainWorktreePath);
    expect(harness.windows).toEqual([welcome]);
    expect(repositorySnapshot(harness, welcome).repository.name).toBe(valid.name);
  });

  it('does not update recency or convert the welcome when initial refresh fails', async () => {
    const location = repositoryLocation('broken');
    const harness = createHarness(new Map([[location.mainWorktreePath, location]]), {
      onCommand: () => Promise.reject(new Error('Repository refresh failed.')),
    });
    const welcome = await harness.manager.ensureWelcomeWindow();

    await expect(
      harness.manager.openRepository(welcome.webContents, location.mainWorktreePath),
    ).rejects.toThrow('Repository refresh failed.');

    expect(welcomeSnapshot(harness, welcome).kind).toBe('welcome');
    expect(harness.store.state.recentRepositories).toEqual([]);
  });

  it('disposes a closed repository once and recreates a welcome only after zero windows', async () => {
    const location = repositoryLocation('alpha');
    const harness = createHarness(new Map([[location.mainWorktreePath, location]]));
    const window = await harness.manager.ensureWelcomeWindow();
    await harness.manager.openRepository(window.webContents, location.mainWorktreePath);
    const service = harness.services[0];
    if (!service) throw new Error('Expected a repository service.');

    expect(await harness.manager.ensureWelcomeWindow()).toBe(window);
    expect(harness.windows).toHaveLength(1);
    window.close();
    expect(service.disposed).toBe(true);

    const replacement = await harness.manager.ensureWelcomeWindow();
    expect(replacement).not.toBe(window);
    expect(welcomeSnapshot(harness, replacement).kind).toBe('welcome');
  });

  it('ignores late background hydration after its repository window closes', async () => {
    const location = repositoryLocation('alpha');
    const releaseHydration = deferred<{ exitCode: number }>();
    const harness = createHarness(new Map([[location.mainWorktreePath, location]]), {
      onCommand: (tool, args) => {
        if (tool === 'git' && args[0] === 'worktree') {
          return { stdout: worktreeOutput(location) };
        }
        if (tool === 'git' && args[0] === 'status') {
          return { stdout: '' };
        }
        if (tool === 'github') return releaseHydration.promise;
        throw new Error('Unexpected command.');
      },
    });
    const window = await harness.manager.ensureWelcomeWindow();
    await harness.manager.openRepository(window.webContents, location.mainWorktreePath);
    const sentBeforeClose = window.webContents.sent.length;

    window.close();
    releaseHydration.resolve({ exitCode: 1 });
    await Promise.resolve();
    await Promise.resolve();

    expect(window.webContents.sent).toHaveLength(sentBeforeClose);
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return {
    promise,
    resolve(value) {
      if (!resolve) throw new Error('Deferred promise is unavailable.');
      resolve(value);
    },
  };
}
