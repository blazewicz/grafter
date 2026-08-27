import { EventEmitter } from 'node:events';
import type {
  WindowSessionSender,
  WindowSessionWindow,
} from '../../../src/main/window-sessions';

export class FakeSender extends EventEmitter implements WindowSessionSender {
  destroyed = false;
  readonly sent: { channel: string; value: unknown }[] = [];

  isDestroyed(): boolean {
    return this.destroyed;
  }

  send(channel: string, value: unknown): void {
    this.sent.push({ channel, value });
  }
}

export class FakeWindow extends EventEmitter implements WindowSessionWindow<FakeSender> {
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
