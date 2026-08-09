import { render, screen, within } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { DiffViewer } from '../../../src/renderer/diff/DiffViewer';
import type {
  DiffFileSummary,
  DiffLine,
  DiffSession,
} from '../../../src/shared/contracts';
import { settingsFactory } from '../../factories';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';

export {
  AnimationFrameHarness,
  installAnimationFrameHarness,
  installDiffViewerObservers,
  IntersectionObserverHarness,
  ResizeObserverHarness,
  stubDiffPaneGeometry,
  stubElementTop,
} from './diff-observer-harness';

export const scenario = buildDiffViewerScenario();

const settings = settingsFactory.build();

export interface DiffViewerCallbacks {
  onSessionChange: (session: DiffSession) => void;
  onClose: () => void;
  onError: (message: string) => void;
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
      toolPreferences={{ editor: 'vscode', terminal: 'terminal' }}
      onSetToolPreference={() => undefined}
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
