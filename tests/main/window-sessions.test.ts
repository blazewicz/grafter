import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { AppSnapshot, CommandRecord } from '../../src/shared/contracts';
import { ipc } from '../../src/shared/ipc';
import {
  WindowSessionRegistry,
  type WindowSessionSender,
  type WindowSessionWindow,
} from '../../src/main/window-sessions';
import { appSnapshotFactory, commandRecordFactory } from '../factories';

class FakeSender extends EventEmitter implements WindowSessionSender {
  destroyed = false;
  readonly sent: { channel: string; value: unknown }[] = [];

  isDestroyed(): boolean {
    return this.destroyed;
  }

  send(channel: string, value: unknown): void {
    this.sent.push({ channel, value });
  }

  destroy(): void {
    this.destroyed = true;
    this.emit('destroyed');
  }
}

class FakeWindow extends EventEmitter implements WindowSessionWindow<FakeSender> {
  destroyed = false;

  constructor(readonly webContents = new FakeSender()) {
    super();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  close(): void {
    this.destroyed = true;
    this.emit('closed');
  }
}

class UpdateSource<T> {
  readonly #subscribers = new Set<(value: T) => void>();
  readonly captured: ((value: T) => void)[] = [];
  unsubscribeCalls = 0;

  subscribe = (subscriber: (value: T) => void): (() => void) => {
    this.#subscribers.add(subscriber);
    this.captured.push(subscriber);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.unsubscribeCalls += 1;
      this.#subscribers.delete(subscriber);
    };
  };

  publish(value: T): void {
    for (const subscriber of this.#subscribers) subscriber(value);
  }
}

interface Registration {
  window: FakeWindow;
  service: { name: string };
  snapshots: UpdateSource<AppSnapshot>;
  commands: UpdateSource<CommandRecord>;
}

function registration(name: string): Registration {
  return {
    window: new FakeWindow(),
    service: { name },
    snapshots: new UpdateSource<AppSnapshot>(),
    commands: new UpdateSource<CommandRecord>(),
  };
}

function register(
  registry: WindowSessionRegistry<FakeSender, FakeWindow, { name: string }>,
  value: Registration,
): () => void {
  return registry.register({
    window: value.window,
    service: value.service,
    subscribeToSnapshotUpdates: value.snapshots.subscribe,
    subscribeToCommandUpdates: value.commands.subscribe,
  });
}

describe('WindowSessionRegistry', () => {
  it('resolves distinct senders to only their own sessions', () => {
    const registry = new WindowSessionRegistry<
      FakeSender,
      FakeWindow,
      { name: string }
    >();
    const first = registration('first');
    const second = registration('second');
    register(registry, first);
    register(registry, second);

    expect(registry.resolve(first.window.webContents)).toMatchObject({
      service: first.service,
      dialogParent: first.window,
    });
    expect(registry.resolve(second.window.webContents)).toMatchObject({
      service: second.service,
      dialogParent: second.window,
    });
  });

  it('targets snapshot and command updates only to their registered window', () => {
    const registry = new WindowSessionRegistry<
      FakeSender,
      FakeWindow,
      { name: string }
    >();
    const first = registration('first');
    const second = registration('second');
    register(registry, first);
    register(registry, second);
    const snapshot = appSnapshotFactory.build();
    const command = commandRecordFactory.build();

    first.snapshots.publish(snapshot);
    second.commands.publish(command);

    expect(first.window.webContents.sent).toEqual([
      { channel: ipc.snapshotUpdate, value: snapshot },
    ]);
    expect(second.window.webContents.sent).toEqual([
      { channel: ipc.commandUpdate, value: command },
    ]);
  });

  it('rejects unknown and destroyed senders with controlled errors', () => {
    const registry = new WindowSessionRegistry<
      FakeSender,
      FakeWindow,
      { name: string }
    >();
    const known = registration('known');
    register(registry, known);

    expect(() => registry.resolve(new FakeSender())).toThrow(
      'Window session is not available for this sender.',
    );
    known.window.webContents.destroy();
    expect(() => registry.resolve(known.window.webContents)).toThrow(
      'Window session is not available for this sender.',
    );
  });

  it('removes registry state and both subscriptions when the window closes', () => {
    const registry = new WindowSessionRegistry<
      FakeSender,
      FakeWindow,
      { name: string }
    >();
    const value = registration('session');
    const dispose = register(registry, value);

    value.window.close();
    dispose();

    expect(value.snapshots.unsubscribeCalls).toBe(1);
    expect(value.commands.unsubscribeCalls).toBe(1);
    expect(() => registry.resolve(value.window.webContents)).toThrow(
      'Window session is not available for this sender.',
    );
  });

  it('ignores and reports a captured late update after disposal', () => {
    const onLateUpdate = vi.fn();
    const registry = new WindowSessionRegistry<FakeSender, FakeWindow, { name: string }>({
      onLateUpdate,
    });
    const value = registration('session');
    const dispose = register(registry, value);
    const lateSnapshotSubscriber = value.snapshots.captured[0];
    const lateCommandSubscriber = value.commands.captured[0];
    const snapshot = appSnapshotFactory.build();
    const command = commandRecordFactory.build();

    dispose();
    lateSnapshotSubscriber?.(snapshot);
    lateCommandSubscriber?.(command);

    expect(value.window.webContents.sent).toEqual([]);
    expect(onLateUpdate).toHaveBeenNthCalledWith(1, 'snapshot');
    expect(onLateUpdate).toHaveBeenNthCalledWith(2, 'command');
  });

  it('cleans up a partial registration when subscription setup fails', () => {
    const registry = new WindowSessionRegistry<
      FakeSender,
      FakeWindow,
      { name: string }
    >();
    const value = registration('session');
    const failure = new Error('Command subscription failed');

    expect(() =>
      registry.register({
        window: value.window,
        service: value.service,
        subscribeToSnapshotUpdates: value.snapshots.subscribe,
        subscribeToCommandUpdates: () => {
          throw failure;
        },
      }),
    ).toThrow(failure);

    expect(value.snapshots.unsubscribeCalls).toBe(1);
    expect(() => registry.resolve(value.window.webContents)).toThrow(
      'Window session is not available for this sender.',
    );
  });
});
