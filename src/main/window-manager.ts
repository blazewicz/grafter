import { randomUUID } from 'node:crypto';
import type { AppSnapshot, ProjectConfig } from '../shared/contracts';
import type { ApplicationRuntime } from './application-runtime';
import {
  RepositoryLocator,
  type RepositoryLocation,
} from './services/repository-locator';
import { RepositoryService } from './services/repository-service';
import type { StateStore } from './store';
import {
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

interface WindowManagerOptions<
  TSender extends WindowSessionSender,
  TWindow extends ManagedWindow<TSender>,
> {
  store: StateStore;
  runtime: ApplicationRuntime;
  sessions: WindowSessionRegistry<TSender, TWindow, WindowSessionService>;
  createWindow: () => TWindow;
  loadWindow: (window: TWindow) => Promise<void>;
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

type ManagedSession = WelcomeManagedSession | RepositoryManagedSession;

/** Owns the one-welcome-or-one-repository lifecycle of every live BrowserWindow. */
export class WindowManager<
  TSender extends WindowSessionSender,
  TWindow extends ManagedWindow<TSender>,
> {
  readonly #store: StateStore;
  readonly #runtime: ApplicationRuntime;
  readonly #sessions: WindowSessionRegistry<TSender, TWindow, WindowSessionService>;
  readonly #createWindow: () => TWindow;
  readonly #loadWindow: (window: TWindow) => Promise<void>;
  readonly #context: { homeDirectory: string; systemLocale: string };
  readonly #locator: Pick<RepositoryLocator, 'locate'>;
  readonly #createRepositoryService: (
    project: ProjectConfig,
    canonicalRepositoryKey: string,
  ) => RepositoryService;
  readonly #createRepositoryId: () => string;
  readonly #windows = new Map<TWindow, ManagedSession>();
  readonly #repositoryWindows = new Map<string, TWindow>();
  readonly #inFlightOpens = new Map<string, Promise<TWindow>>();
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
    const liveWindow = [...this.#windows.keys()].find((window) => !window.isDestroyed());
    if (liveWindow) return liveWindow;
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
    const window = this.#createWindow();
    this.#trackWindow(window);
    this.#installWelcomeSession(window);
    return this.#loadWindow(window).then(
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
      const targetWindow = reuseWelcome ? invokingWindow : this.#createWindow();
      if (!reuseWelcome) this.#trackWindow(targetWindow);
      this.#installRepositorySession(targetWindow, location.commonDirectoryPath, service);

      if (reuseWelcome) {
        service.publishSnapshot();
      } else {
        try {
          await this.#loadWindow(targetWindow);
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
    previous.disposeRegistration();
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

  #session(window: TWindow): ManagedSession {
    const session = this.#windows.get(window);
    if (!session || window.isDestroyed()) {
      throw new Error('Window session is not available.');
    }
    return session;
  }
}
