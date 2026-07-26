import { vi } from 'vitest';

interface ObserverRecord {
  observer: IntersectionObserver;
  callback: IntersectionObserverCallback;
  observed: Set<Element>;
  disconnected: boolean;
}

interface ResizeObserverRecord {
  observer: ResizeObserver;
  callback: ResizeObserverCallback;
  observed: Set<Element>;
  disconnected: boolean;
}

export class IntersectionObserverHarness {
  private readonly records: ObserverRecord[] = [];

  readonly Observer: typeof IntersectionObserver;

  constructor() {
    const registerObserver = (
      observer: IntersectionObserver,
      callback: IntersectionObserverCallback,
    ): void => this.register(observer, callback);
    const disconnectObserver = (observer: IntersectionObserver): void =>
      this.disconnect(observer);
    const observeTarget = (observer: IntersectionObserver, target: Element): void =>
      this.observe(observer, target);
    const unobserveTarget = (observer: IntersectionObserver, target: Element): void =>
      this.unobserve(observer, target);
    this.Observer = class ControlledIntersectionObserver implements IntersectionObserver {
      readonly root: Element | Document | null;
      readonly rootMargin: string;
      readonly scrollMargin = '0px';
      readonly thresholds: readonly number[];

      constructor(
        callback: IntersectionObserverCallback,
        options: IntersectionObserverInit = {},
      ) {
        this.root = options.root ?? null;
        this.rootMargin = options.rootMargin ?? '0px';
        this.thresholds =
          typeof options.threshold === 'number'
            ? [options.threshold]
            : (options.threshold ?? [0]);
        registerObserver(this, callback);
      }

      disconnect(): void {
        disconnectObserver(this);
      }

      observe(target: Element): void {
        observeTarget(this, target);
      }

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }

      unobserve(target: Element): void {
        unobserveTarget(this, target);
      }
    };
  }

  notify(target: Element, isIntersecting: boolean): void {
    const bounds = target.getBoundingClientRect();
    const entry = {
      boundingClientRect: bounds,
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: isIntersecting ? bounds : new DOMRectReadOnly(),
      isIntersecting,
      rootBounds: null,
      target,
      time: 0,
    } satisfies IntersectionObserverEntry;

    for (const record of this.records) {
      if (!record.disconnected && record.observed.has(target)) {
        record.callback([entry], record.observer);
      }
    }
  }

  activeObserverCount(target: Element): number {
    return this.records.filter(
      (record) => !record.disconnected && record.observed.has(target),
    ).length;
  }

  disconnectedObserverCount(target: Element): number {
    return this.records.filter(
      (record) => record.disconnected && record.observed.has(target),
    ).length;
  }

  reset(): void {
    this.records.length = 0;
  }

  private register(
    observer: IntersectionObserver,
    callback: IntersectionObserverCallback,
  ): void {
    this.records.push({
      observer,
      callback,
      observed: new Set(),
      disconnected: false,
    });
  }

  private observe(observer: IntersectionObserver, target: Element): void {
    this.recordFor(observer).observed.add(target);
  }

  private unobserve(observer: IntersectionObserver, target: Element): void {
    this.recordFor(observer).observed.delete(target);
  }

  private disconnect(observer: IntersectionObserver): void {
    this.recordFor(observer).disconnected = true;
  }

  private recordFor(observer: IntersectionObserver): ObserverRecord {
    const record = this.records.find((candidate) => candidate.observer === observer);
    if (!record) throw new Error('Expected the observer to be registered.');
    return record;
  }
}

export class ResizeObserverHarness {
  private readonly records: ResizeObserverRecord[] = [];

  readonly Observer: typeof ResizeObserver;

  constructor() {
    const registerObserver = (
      observer: ResizeObserver,
      callback: ResizeObserverCallback,
    ): void => this.register(observer, callback);
    const disconnectObserver = (observer: ResizeObserver): void =>
      this.disconnect(observer);
    const observeTarget = (observer: ResizeObserver, target: Element): void =>
      this.observe(observer, target);
    const unobserveTarget = (observer: ResizeObserver, target: Element): void =>
      this.unobserve(observer, target);
    this.Observer = class ControlledResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        registerObserver(this, callback);
      }

      disconnect(): void {
        disconnectObserver(this);
      }

      observe(target: Element): void {
        observeTarget(this, target);
      }

      unobserve(target: Element): void {
        unobserveTarget(this, target);
      }
    };
  }

  notify(target: Element): void {
    const bounds = target.getBoundingClientRect();
    const size = {
      blockSize: bounds.height,
      inlineSize: bounds.width,
    } satisfies ResizeObserverSize;
    const entry = {
      borderBoxSize: [size],
      contentBoxSize: [size],
      contentRect: bounds,
      devicePixelContentBoxSize: [size],
      target,
    } satisfies ResizeObserverEntry;

    for (const record of this.records) {
      if (!record.disconnected && record.observed.has(target)) {
        record.callback([entry], record.observer);
      }
    }
  }

  activeObserverCount(target?: Element): number {
    return this.records.filter(
      (record) =>
        !record.disconnected && (target === undefined || record.observed.has(target)),
    ).length;
  }

  disconnectedObserverCount(target?: Element): number {
    return this.records.filter(
      (record) =>
        record.disconnected && (target === undefined || record.observed.has(target)),
    ).length;
  }

  reset(): void {
    this.records.length = 0;
  }

  private register(observer: ResizeObserver, callback: ResizeObserverCallback): void {
    this.records.push({
      observer,
      callback,
      observed: new Set(),
      disconnected: false,
    });
  }

  private observe(observer: ResizeObserver, target: Element): void {
    this.recordFor(observer).observed.add(target);
  }

  private unobserve(observer: ResizeObserver, target: Element): void {
    this.recordFor(observer).observed.delete(target);
  }

  private disconnect(observer: ResizeObserver): void {
    this.recordFor(observer).disconnected = true;
  }

  private recordFor(observer: ResizeObserver): ResizeObserverRecord {
    const record = this.records.find((candidate) => candidate.observer === observer);
    if (!record) throw new Error('Expected the resize observer to be registered.');
    return record;
  }
}

export class AnimationFrameHarness {
  private nextId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();
  private readonly cancelledIds = new Set<number>();

  request = (callback: FrameRequestCallback): number => {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  };

  cancel = (id: number): void => {
    if (this.callbacks.delete(id)) this.cancelledIds.add(id);
  };

  flushNext(): void {
    const next = this.callbacks.entries().next().value;
    if (!next) throw new Error('Expected a pending animation frame.');
    const [id, callback] = next;
    this.callbacks.delete(id);
    callback(0);
  }

  pendingCount(): number {
    return this.callbacks.size;
  }

  cancelledCount(): number {
    return this.cancelledIds.size;
  }

  reset(): void {
    this.callbacks.clear();
    this.cancelledIds.clear();
    this.nextId = 1;
  }
}

export interface DiffPaneGeometry {
  top: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollPaddingTop: number;
}

export function stubDiffPaneGeometry(
  pane: HTMLElement,
  geometry: DiffPaneGeometry,
): void {
  Object.defineProperties(pane, {
    scrollTop: {
      configurable: true,
      value: geometry.scrollTop,
      writable: true,
    },
    scrollHeight: {
      configurable: true,
      get: () => geometry.scrollHeight,
    },
    clientHeight: {
      configurable: true,
      get: () => geometry.clientHeight,
    },
  });
  pane.style.scrollPaddingTop = `${geometry.scrollPaddingTop}px`;
  vi.spyOn(pane, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, geometry.top, 800, geometry.clientHeight),
  );
}

export function stubElementTop(element: Element, top: number | (() => number)): void {
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
    const resolvedTop = typeof top === 'function' ? top() : top;
    return new DOMRect(0, resolvedTop, 800, 40);
  });
}

export function installDiffViewerObservers(
  resizeObservers: ResizeObserverHarness = new ResizeObserverHarness(),
): IntersectionObserverHarness {
  const intersectionObservers = new IntersectionObserverHarness();
  vi.stubGlobal('IntersectionObserver', intersectionObservers.Observer);
  vi.stubGlobal('ResizeObserver', resizeObservers.Observer);
  return intersectionObservers;
}

export function installAnimationFrameHarness(): AnimationFrameHarness {
  const animationFrames = new AnimationFrameHarness();
  vi.stubGlobal('requestAnimationFrame', animationFrames.request);
  vi.stubGlobal('cancelAnimationFrame', animationFrames.cancel);
  return animationFrames;
}
