import { render, screen, within } from '@testing-library/react';
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

class InertResizeObserver implements ResizeObserver {
  disconnect(): void {
    return undefined;
  }

  observe(target: Element): void {
    void target;
  }

  unobserve(target: Element): void {
    void target;
  }
}

export interface DiffViewerCallbacks {
  onSessionChange: (session: DiffSession) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

export function installDiffViewerObservers(): IntersectionObserverHarness {
  const intersectionObservers = new IntersectionObserverHarness();
  vi.stubGlobal('IntersectionObserver', intersectionObservers.Observer);
  vi.stubGlobal('ResizeObserver', InertResizeObserver);
  return intersectionObservers;
}

export function renderDiffViewer(
  session: DiffSession = scenario.branchSession,
  callbacks: DiffViewerCallbacks = {
    onSessionChange: () => undefined,
    onClose: () => undefined,
    onError: () => undefined,
  },
): void {
  render(
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
