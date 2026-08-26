import { randomUUID } from 'node:crypto';
import type {
  AppSnapshot,
  DiffSession,
  OpenDiffWindowRequest,
  ProjectConfig,
  Settings,
} from '../shared/contracts';
import type { ApplicationRuntime } from './application-runtime';
import { diffWindowKey } from './diff-window-keys';
import {
  RepositoryLocator,
  type RepositoryLocation,
} from './services/repository-locator';
import { RepositoryService } from './services/repository-service';
import type { StateStore } from './store';
import {
  DiffWindowSession,
  RepositoryWindowSession,
  WelcomeWindowSession,
  type WindowSessionService,
} from './window-session-services';
import type {
  WindowSessionRegistry,
  WindowSessionSender,
  WindowSessionWindow,
} from './window-sessions';

export interface ManagedWindow<
  TSender extends WindowSessionSender,
> extends WindowSessionWindow<TSender> {
  focus(): void;
  close(): void;
}

/** Which renderer surface a BrowserWindow hosts. */
export type WindowKind = 'app' | 'diff';

interface WindowManagerOptions<
  TSender extends WindowSessionSender,
  TWindow extends ManagedWindow<TSender>,
> {
  store: StateStore;
  runtime: ApplicationRuntime;
  sessions: WindowSessionRegistry<TSender, TWindow, WindowSessionService>;
  createWindow: (kind: WindowKind) => TWindow;
  loadWindow: (window: TWindow, kind: WindowKind) => Promise<void>;
  homeDirectory: string;
  systemLocale: string;
  locator?: Pick<RepositoryLocator, 'locate'>;
  createRepositoryService?: (
    project: ProjectConfig,
    canonicalRepositoryKey: string,
  ) => RepositoryService;
  createRepositoryId?: () => string;
}

interface WelcomeManagedSession {
  kind: 'welcome';
  service: WelcomeWindowSession;
  disposeRegistration: () => void;
}

interface RepositoryManagedSession {
  kind: 'repository';
  canonicalRepositoryKey: string;
  service: RepositoryWindowSession;
  disposeRegistration: () => void;
}

interface DiffManagedSession<TSender extends WindowSessionSender> {
  kind: 'diff';
  canonicalRepositoryKey: string;
  dedupeKey: string;
  sender: TSender;
  service: DiffWindowSession;
  disposeRegistration: () => void;
}

type ManagedSession<TSender extends WindowSessionSender> =
  WelcomeManagedSession | RepositoryManagedSession | DiffManagedSession<TSender>;

/** Owns the lifecycle of every live BrowserWindow. */
export class WindowManager<
  TSender extends WindowSessionSender,
  TWindow extends ManagedWindow<TSender>,
> {
  readonly #store: StateStore;
  readonly #runtime: ApplicationRuntime;
  readonly #sessions: WindowSessionRegistry<TSender, TWindow, WindowSessionService>;
  readonly #createWindow: (kind: WindowKind) => TWindow;
  readonly #loadWindow: (window: TWindow, kind: WindowKind) => Promise<void>;
  readonly #context: { homeDirectory: string; systemLocale: string };
  readonly #locator: Pick<RepositoryLocator, 'locate'>;
  readonly #createRepositoryService: (
    project: ProjectConfig,
    canonicalRepositoryKey: string,
  ) => RepositoryService;
  readonly #createRepositoryId: () => string;
  readonly #windows = new Map<TWindow, ManagedSession<TSender>>();
  readonly #repositoryWindows = new Map<string, TWindow>();
  readonly #diffWindows = new Map<string, TWindow>();
  readonly #pendingDiffInit = new Map<TSender, DiffSession>();
  readonly #inFlightOpens = new Map<string, Promise<TWindow>>();
  readonly #inFlightDiffOpens = new Map<string, Promise<void>>();
  #welcomeCreation: Promise<TWindow> | undefined;

  constructor(options: WindowManagerOptions<TSender, TWindow>) {
    this.#store = options.store;
    this.#runtime = options.runtime;
    this.#sessions = options.sessions;
    this.#createWindow = options.createWindow;
    this.#loadWindow = options.loadWindow;
    this.#context = {
      homeDirectory: options.homeDirectory,
      systemLocale: options.systemLocale,
    };
    this.#locator =
      options.locator ?? new RepositoryLocator(options.runtime.commandRunner);
    this.#createRepositoryService =
      options.createRepositoryService ??
      ((project, canonicalRepositoryKey) =>
        new RepositoryService(
          project,
          canonicalRepositoryKey,
          options.store,
          options.runtime,
        ));
    this.#createRepositoryId = options.createRepositoryId ?? randomUUID;
  }

  async ensureWelcomeWindow(): Promise<TWindow> {
    // Diff windows are not "the application window": reactivation focuses or
    // recreates an app surface instead.
    const liveAppWindow = [...this.#windows].find(
      ([window, session]) => session.kind !== 'diff' && !window.isDestroyed(),
    );
    if (liveAppWindow) return liveAppWindow[0];
    if (this.#welcomeCreation) return this.#welcomeCreation;

    const creation = this.#createWelcomeWindow();
    this.#welcomeCreation = creation;
    try {
      return await creation;
    } finally {
      if (this.#welcomeCreation === creation) this.#welcomeCreation = undefined;
    }
  }

  async openRepository(sender: TSender, selectedPath: string): Promise<AppSnapshot> {
    const invokingWindow = this.#sessions.resolve(sender).dialogParent;
    await this.openRepositoryFromWindow(invokingWindow, selectedPath);
    return this.#session(invokingWindow).service.snapshot();
  }

  async openRecentRepository(
    sender: TSender,
    repositoryId: string,
  ): Promise<AppSnapshot> {
    const repository = this.#store.state.recentRepositories.find(
      (candidate) => candidate.repositoryId === repositoryId,
    );
    if (!repository) throw new Error('Recent repository not found.');
    return this.openRepository(sender, repository.lastOpenedPath);
  }

  async updateSettings(sender: TSender, settings: Settings): Promise<AppSnapshot> {
    const session = this.#sessions.resolve(sender).service;
    const snapshot = await session.updateSettings(settings);
    this.#publishSnapshots();
    return snapshot;
  }

  /**
   * Opens a diff session in its own floating window. Identical diffs are
   * deduped: an open window showing the same branch pair or commit is focused
   * and the freshly created git diff session is evicted.
   */
  async openDiffWindow(sender: TSender, request: OpenDiffWindowRequest): Promise<void> {
    const invokingWindow = this.#sessions.resolve(sender).dialogParent;
    const invoking = this.#session(invokingWindow);
    if (invoking.kind !== 'repository') {
      throw new Error('Opening a diff requires an open repository.');
    }

    const inFlightKey = `${invoking.canonicalRepositoryKey}|${
      request.kind === 'worktree'
        ? `worktree|${request.worktreeId}`
        : `commit|${request.commitHash}`
    }`;
    const inFlight = this.#inFlightDiffOpens.get(inFlightKey);
    if (inFlight) return inFlight;

    const open = this.#openDiffWindow(invoking, request);
    this.#inFlightDiffOpens.set(inFlightKey, open);
    try {
      await open;
    } finally {
      if (this.#inFlightDiffOpens.get(inFlightKey) === open) {
        this.#inFlightDiffOpens.delete(inFlightKey);
      }
    }
  }

  /** Initial diff session handed to a booting diff window for this sender. */
  diffWindowInit(sender: TSender): DiffSession | undefined {
    return this.#pendingDiffInit.get(sender);
  }

  async #openDiffWindow(
    invoking: RepositoryManagedSession,
    request: OpenDiffWindowRequest,
  ): Promise<void> {
    const session =
      request.kind === 'worktree'
        ? await invoking.service.repository.openDiff(request.worktreeId)
        : await invoking.service.repository.openCommitDiff({
            commitHash: request.commitHash,
          });

    try {
      const outcome = await this.#installDiffWindow(
        invoking.service.repository,
        invoking.canonicalRepositoryKey,
        session,
      );
      if (outcome === 'reused') {
        // An existing window already owns this content; the fresh session lost
        // the race and is evicted before it can leak an LRU slot.
        invokeQuietly(() => invoking.service.repository.closeDiff(session.id));
      }
    } catch (error) {
      // The window never took ownership of the session; evict it so nothing leaks.
      invokeQuietly(() => invoking.service.repository.closeDiff(session.id));
      throw error;
    }
  }

  /**
   * Installs a freshly created diff session into its own window. Returns
   * 'reused' when a window showing the same content already exists; the caller
   * must then evict the fresh session.
   */
  async #installDiffWindow(
    repository: RepositoryService,
    canonicalRepositoryKey: string,
    session: DiffSession,
  ): Promise<'created' | 'reused'> {
    const key = diffWindowKey(session);
    const existing = this.#diffWindows.get(key);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return 'reused';
    }
    this.#diffWindows.delete(key);

    const window = this.#createWindow('diff');
    const service = new DiffWindowSession(
      repository,
      this.#store,
      this.#context,
      session,
      (next) => this.#retrackDiffWindow(window, next),
    );
    const disposeRegistration = this.#sessions.register({
      window,
      service,
      subscribeToSnapshotUpdates: (subscriber) =>
        service.subscribeToSnapshotUpdates(subscriber),
      subscribeToCommandUpdates: (subscriber) =>
        service.subscribeToCommandUpdates(subscriber),
    });
    this.#windows.set(window, {
      kind: 'diff',
      canonicalRepositoryKey,
      dedupeKey: key,
      sender: window.webContents,
      service,
      disposeRegistration,
    });
    this.#diffWindows.set(key, window);
    this.#pendingDiffInit.set(window.webContents, session);
    this.#trackWindow(window);

    try {
      await this.#loadWindow(window, 'diff');
    } catch (error) {
      this.#discardWindow(window);
      throw error;
    }
    window.focus();
    return 'created';
  }

  /** Keeps the dedupe index aligned when the toolbar replaces the shown diff. */
  #retrackDiffWindow(window: TWindow, next: DiffSession): void {
    const managed = this.#windows.get(window);
    if (managed?.kind !== 'diff') return;
    const nextKey = diffWindowKey(next);
    if (nextKey === managed.dedupeKey) return;
    if (this.#diffWindows.get(managed.dedupeKey) === window) {
      this.#diffWindows.delete(managed.dedupeKey);
    }
    managed.dedupeKey = nextKey;
    this.#diffWindows.set(nextKey, window);
  }

  #closeDiffWindowsFor(canonicalRepositoryKey: string): void {
    for (const [window, managed] of [...this.#windows]) {
      if (
        managed.kind === 'diff' &&
        managed.canonicalRepositoryKey === canonicalRepositoryKey &&
        !window.isDestroyed()
      ) {
        this.#replaceSession(window);
        window.close();
      }
    }
  }

  async openRepositoryFromWindow(
    invokingWindow: TWindow,
    selectedPath: string,
  ): Promise<TWindow> {
    this.#session(invokingWindow);
    const location = await this.#locator.locate(selectedPath);
    const existingOpen = this.#repositoryWindows.get(location.commonDirectoryPath);
    if (existingOpen && !existingOpen.isDestroyed()) {
      await this.#focusExisting(existingOpen, location);
      return existingOpen;
    }

    const activeOpen = this.#inFlightOpens.get(location.commonDirectoryPath);
    if (activeOpen) {
      const window = await activeOpen;
      await this.#focusExisting(window, location);
      return window;
    }

    const open = this.#openResolvedRepository(invokingWindow, location);
    this.#inFlightOpens.set(location.commonDirectoryPath, open);
    try {
      return await open;
    } finally {
      if (this.#inFlightOpens.get(location.commonDirectoryPath) === open) {
        this.#inFlightOpens.delete(location.commonDirectoryPath);
      }
    }
  }

  #createWelcomeWindow(): Promise<TWindow> {
    const window = this.#createWindow('app');
    this.#trackWindow(window);
    this.#installWelcomeSession(window);
    return this.#loadWindow(window, 'app').then(
      () => window,
      (error: unknown) => {
        this.#discardWindow(window);
        throw error;
      },
    );
  }

  async #openResolvedRepository(
    invokingWindow: TWindow,
    location: RepositoryLocation,
  ): Promise<TWindow> {
    const persisted = this.#store.state;
    const recent = persisted.recentRepositories.find(
      (candidate) =>
        candidate.commonDirectoryPath === location.commonDirectoryPath ||
        candidate.mainWorktreePath === location.mainWorktreePath,
    );
    const repositoryId = recent?.repositoryId ?? this.#createRepositoryId();
    const setupScript = this.#store.repositorySetupScript(repositoryId);
    const project: ProjectConfig = {
      id: repositoryId,
      name: location.name,
      path: location.mainWorktreePath,
      ...(setupScript ? { setupScript } : {}),
    };

    const repository = this.#createRepositoryService(
      project,
      location.commonDirectoryPath,
    );
    try {
      await repository.refresh();
      await this.#store.addRepository(
        project,
        location.selectedWorktreePath,
        location.commonDirectoryPath,
      );
      repository.startPullRequestHydration();
      const service = new RepositoryWindowSession(
        repository,
        this.#store,
        this.#runtime,
        this.#context,
      );
      service.selectWorktreePath(location.selectedWorktreePath);

      const invokingSession = this.#session(invokingWindow);
      const reuseWelcome = invokingSession.kind === 'welcome';
      const targetWindow = reuseWelcome ? invokingWindow : this.#createWindow('app');
      if (!reuseWelcome) this.#trackWindow(targetWindow);
      this.#installRepositorySession(targetWindow, location.commonDirectoryPath, service);

      if (reuseWelcome) {
        service.publishSnapshot();
      } else {
        try {
          await this.#loadWindow(targetWindow, 'app');
        } catch (error) {
          this.#discardWindow(targetWindow);
          throw error;
        }
      }
      targetWindow.focus();
      this.#publishWelcomeSnapshots();
      return targetWindow;
    } catch (error) {
      repository.dispose();
      throw error;
    }
  }

  async #focusExisting(window: TWindow, location: RepositoryLocation): Promise<void> {
    const session = this.#session(window);
    if (session.kind !== 'repository') {
      throw new Error('The repository window is no longer available.');
    }
    await this.#store.openRepository(
      session.service.repository.repositoryId,
      location.selectedWorktreePath,
      location.commonDirectoryPath,
    );
    session.service.selectWorktreePath(location.selectedWorktreePath);
    window.focus();
    this.#publishWelcomeSnapshots();
  }

  #installWelcomeSession(window: TWindow): void {
    this.#replaceSession(window);
    const service = new WelcomeWindowSession(this.#store, this.#context);
    const disposeRegistration = this.#sessions.register({
      window,
      service,
      subscribeToSnapshotUpdates: (subscriber) =>
        service.subscribeToSnapshotUpdates(subscriber),
      subscribeToCommandUpdates: (subscriber) =>
        service.subscribeToCommandUpdates(subscriber),
    });
    this.#windows.set(window, { kind: 'welcome', service, disposeRegistration });
    service.publishSnapshot();
  }

  #installRepositorySession(
    window: TWindow,
    canonicalRepositoryKey: string,
    service: RepositoryWindowSession,
  ): void {
    this.#replaceSession(window);
    const disposeRegistration = this.#sessions.register({
      window,
      service,
      subscribeToSnapshotUpdates: (subscriber) =>
        service.subscribeToSnapshotUpdates(subscriber),
      subscribeToCommandUpdates: (subscriber) =>
        service.subscribeToCommandUpdates(subscriber),
    });
    this.#windows.set(window, {
      kind: 'repository',
      canonicalRepositoryKey,
      service,
      disposeRegistration,
    });
    this.#repositoryWindows.set(canonicalRepositoryKey, window);
  }

  #replaceSession(window: TWindow): void {
    const previous = this.#windows.get(window);
    if (!previous) return;
    // Closing a repository window cascades to the diff windows it spawned, so
    // their sessions are evicted while the repository service is still alive.
    if (previous.kind === 'repository') {
      this.#closeDiffWindowsFor(previous.canonicalRepositoryKey);
    }
    previous.disposeRegistration();
    if (previous.kind === 'diff') {
      this.#pendingDiffInit.delete(previous.sender);
      if (this.#diffWindows.get(previous.dedupeKey) === window) {
        this.#diffWindows.delete(previous.dedupeKey);
      }
    }
    previous.service.dispose();
    if (
      previous.kind === 'repository' &&
      this.#repositoryWindows.get(previous.canonicalRepositoryKey) === window
    ) {
      this.#repositoryWindows.delete(previous.canonicalRepositoryKey);
    }
    this.#windows.delete(window);
  }

  #trackWindow(window: TWindow): void {
    window.once('closed', () => this.#disposeWindow(window));
  }

  #disposeWindow(window: TWindow): void {
    this.#replaceSession(window);
  }

  #discardWindow(window: TWindow): void {
    this.#disposeWindow(window);
    if (!window.isDestroyed()) window.close();
  }

  #publishWelcomeSnapshots(): void {
    for (const session of this.#windows.values()) {
      if (session.kind === 'welcome') session.service.publishSnapshot();
    }
  }

  #publishSnapshots(): void {
    this.#sessions.forEachService((service) => service.publishSnapshot());
  }

  #session(window: TWindow): ManagedSession<TSender> {
    const session = this.#windows.get(window);
    if (!session || window.isDestroyed()) {
      throw new Error('Window session is not available.');
    }
    return session;
  }
}

function invokeQuietly(action: () => void): void {
  try {
    action();
  } catch (error) {
    console.error('A cleanup action failed.', error);
  }
}
