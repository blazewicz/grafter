import { render, screen, within } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { vi } from 'vitest';
import { DiffViewer } from '../../../../src/renderer/components/diff/DiffViewer';
import type {
  DiffFileSummary,
  DiffLine,
  DiffSession,
} from '../../../../src/shared/contracts';
import { settingsFactory } from '../../../factories';
import { buildDiffViewerScenario } from '../../../scenarios/diff/diff-viewer';

export const scenario = buildDiffViewerScenario();

const settings = settingsFactory.build();

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

export interface DiffViewerCallbacks {
  onSessionChange: (session: DiffSession) => void;
  onClose: () => void;
  onError: (message: string) => void;
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

export function renderDiffViewer(
  session: DiffSession = scenario.branchSession,
  callbacks: DiffViewerCallbacks = {
    onSessionChange: () => undefined,
    onClose: () => undefined,
    onError: () => undefined,
  },
): RenderResult {
  return render(
    <DiffViewer
      session={session}
      settings={settings}
      systemLocale="en-US"
      {...callbacks}
    />,
  );
}

export function getFileSection(file: DiffFileSummary): HTMLElement {
  const collapseButton = screen.getByRole('button', {
    name: `Collapse ${file.path} diff`,
  });
  const section = collapseButton.closest<HTMLElement>('[data-diff-file-id]');
  if (!section) throw new Error(`Expected a diff section for ${file.path}.`);
  return section;
}

export function getDiffPane(
  file: DiffFileSummary = scenario.files.modified,
): HTMLElement {
  const pane = getFileSection(file).parentElement;
  if (!pane) throw new Error('Expected the rendered file to belong to the diff pane.');
  return pane;
}

export function getDiffLineRow(file: DiffFileSummary, line: DiffLine): HTMLElement {
  const code = within(getFileSection(file)).getByText(line.text, { selector: 'code' });
  const row = code.closest<HTMLElement>('[data-diff-line-id]');
  if (!row) throw new Error(`Expected a rendered diff row for ${line.text}.`);
  return row;
}

export function selectDiffLineText(
  startRow: HTMLElement,
  endRow: HTMLElement = startRow,
): string {
  const startNode = startRow.querySelector('code')?.firstChild;
  const endNode = endRow.querySelector('code')?.firstChild;
  const selection = window.getSelection();
  if (!startNode || !endNode || !selection) {
    throw new Error('Expected selectable text nodes in both diff rows.');
  }

  const range = document.createRange();
  range.setStart(startNode, 0);
  range.setEnd(endNode, endNode.textContent?.length ?? 0);
  selection.removeAllRanges();
  selection.addRange(range);
  const selectedText = selection.toString();
  if (!selectedText) throw new Error('Expected the diff line range to select text.');
  return selectedText;
}
