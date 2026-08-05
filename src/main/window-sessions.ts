import type { AppSnapshot, CommandRecord } from '../shared/contracts';
import { ipc } from '../shared/ipc';

interface EventSource {
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
}

export interface WindowSessionSender extends EventSource {
  isDestroyed(): boolean;
  send(channel: string, value: unknown): void;
}

export interface WindowSessionWindow<
  TSender extends WindowSessionSender,
> extends EventSource {
  readonly webContents: TSender;
  isDestroyed(): boolean;
}

type Subscriber<T> = (value: T) => void;
type Subscribe<T> = (subscriber: Subscriber<T>) => () => void;

export interface WindowSession<TService, TWindow> {
  readonly service: TService;
  readonly dialogParent: TWindow;
}

interface RegisteredWindowSession<TService, TWindow> extends WindowSession<
  TService,
  TWindow
> {
  disposed: boolean;
  unsubscribe: (() => void)[];
}

interface WindowSessionRegistration<
  TSender extends WindowSessionSender,
  TWindow extends WindowSessionWindow<TSender>,
  TService,
> {
  window: TWindow;
  service: TService;
  subscribeToSnapshotUpdates: Subscribe<AppSnapshot>;
  subscribeToCommandUpdates: Subscribe<CommandRecord>;
}

interface WindowSessionRegistryOptions {
  onLateUpdate?: (kind: 'snapshot' | 'command') => void;
}

export class WindowSessionRegistry<
  TSender extends WindowSessionSender,
  TWindow extends WindowSessionWindow<TSender>,
  TService,
> {
  readonly #sessions = new Map<TSender, RegisteredWindowSession<TService, TWindow>>();
  readonly #onLateUpdate: (kind: 'snapshot' | 'command') => void;

  constructor(options: WindowSessionRegistryOptions = {}) {
    this.#onLateUpdate =
      options.onLateUpdate ??
      ((kind) => console.warn(`Ignored a late ${kind} update for a disposed window.`));
  }

  register(
    registration: WindowSessionRegistration<TSender, TWindow, TService>,
  ): () => void {
    const { window, service } = registration;
    const sender = window.webContents;
    if (window.isDestroyed() || sender.isDestroyed()) {
      throw new Error('Cannot register a destroyed window session.');
    }
    if (this.#sessions.has(sender)) {
      throw new Error('A window session is already registered for this sender.');
    }

    const session: RegisteredWindowSession<TService, TWindow> = {
      service,
      dialogParent: window,
      disposed: false,
      unsubscribe: [],
    };
    this.#sessions.set(sender, session);

    const dispose = (): void => this.#dispose(sender, session, dispose);
    window.once('closed', dispose);
    sender.once('destroyed', dispose);

    try {
      this.#trackSubscription(
        session,
        registration.subscribeToSnapshotUpdates((snapshot) =>
          this.#publish(sender, session, 'snapshot', snapshot),
        ),
      );
      this.#trackSubscription(
        session,
        registration.subscribeToCommandUpdates((command) =>
          this.#publish(sender, session, 'command', command),
        ),
      );
    } catch (error) {
      dispose();
      throw error;
    }

    return dispose;
  }

  resolve(sender: TSender): WindowSession<TService, TWindow> {
    const session = this.#sessions.get(sender);
    if (
      !session ||
      session.disposed ||
      session.dialogParent.isDestroyed() ||
      sender.isDestroyed()
    ) {
      throw new Error('Window session is not available for this sender.');
    }
    return session;
  }

  #trackSubscription(
    session: RegisteredWindowSession<TService, TWindow>,
    unsubscribe: () => void,
  ): void {
    if (session.disposed) unsubscribe();
    else session.unsubscribe.push(unsubscribe);
  }

  #publish(
    sender: TSender,
    session: RegisteredWindowSession<TService, TWindow>,
    kind: 'snapshot' | 'command',
    value: AppSnapshot | CommandRecord,
  ): void {
    if (
      session.disposed ||
      this.#sessions.get(sender) !== session ||
      session.dialogParent.isDestroyed() ||
      sender.isDestroyed()
    ) {
      this.#onLateUpdate(kind);
      return;
    }

    try {
      sender.send(kind === 'snapshot' ? ipc.snapshotUpdate : ipc.commandUpdate, value);
    } catch (error) {
      if (
        session.disposed ||
        session.dialogParent.isDestroyed() ||
        sender.isDestroyed()
      ) {
        this.#onLateUpdate(kind);
        return;
      }
      throw error;
    }
  }

  #dispose(
    sender: TSender,
    session: RegisteredWindowSession<TService, TWindow>,
    listener: () => void,
  ): void {
    if (session.disposed) return;
    session.disposed = true;
    if (this.#sessions.get(sender) === session) this.#sessions.delete(sender);
    session.dialogParent.removeListener('closed', listener);
    sender.removeListener('destroyed', listener);
    for (const unsubscribe of session.unsubscribe.splice(0)) unsubscribe();
  }
}
