import type { DiffFilePatch, DiffLine } from '../../shared/contracts';

export interface DiffLineSelection {
  text: string;
  lines: DiffLine[];
}

interface DiffLineDomSelection {
  text: string;
  rowIds: Set<string>;
}

export function selectionWithinFile(
  lineElement: HTMLElement,
): DiffLineDomSelection | undefined {
  const selection = window.getSelection();
  const file = lineElement.closest<HTMLElement>('[data-diff-file-id]');
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  const lineCode = lineElement.querySelector('code');
  if (
    !selection ||
    selection.isCollapsed ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !file?.contains(selection.anchorNode) ||
    !file.contains(selection.focusNode) ||
    !range ||
    !lineCode ||
    !range.intersectsNode(lineCode)
  ) {
    return undefined;
  }
  const text = selection.toString();
  if (!text) return undefined;

  const rowIds = new Set(
    [...file.querySelectorAll<HTMLElement>('[data-diff-line-id]')].flatMap((row) => {
      const id = row.dataset.diffLineId;
      const code = row.querySelector('code');
      return id && code && range.intersectsNode(code) ? [id] : [];
    }),
  );
  return rowIds.size ? { text, rowIds } : undefined;
}

export function selectedDiffLines(
  patch: DiffFilePatch,
  selectedRowIds: ReadonlySet<string>,
): DiffLine[] {
  return patch.hunks.flatMap((hunk, hunkIndex) =>
    hunk.lines.filter((_line, lineIndex) =>
      selectedRowIds.has(diffLineRowId(patch.fileId, hunkIndex, lineIndex)),
    ),
  );
}

export function updateDiffLineSelection(pane: HTMLElement | null): void {
  if (!pane) return;
  const rows = [...pane.querySelectorAll<HTMLElement>('[data-diff-line-id]')];
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  const anchorFile = selection?.anchorNode
    ? parentElement(selection.anchorNode)?.closest<HTMLElement>('[data-diff-file-id]')
    : null;
  const focusFile = selection?.focusNode
    ? parentElement(selection.focusNode)?.closest<HTMLElement>('[data-diff-file-id]')
    : null;
  const selectedFile =
    selection && !selection.isCollapsed && range && anchorFile === focusFile
      ? anchorFile
      : null;

  for (const row of rows) {
    const code = row.querySelector('code');
    const selected = Boolean(
      selectedFile?.contains(row) && code && range?.intersectsNode(code),
    );
    if (selected) row.dataset.selected = 'true';
    else delete row.dataset.selected;
  }
}

export function clearDiffLineSelection(pane: HTMLElement | null): void {
  for (const row of pane?.querySelectorAll<HTMLElement>('[data-selected]') ?? []) {
    delete row.dataset.selected;
  }
}

export function diffLineRowId(
  fileId: string,
  hunkIndex: number,
  lineIndex: number,
): string {
  return `${fileId}:${hunkIndex}:${lineIndex}`;
}

function parentElement(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}
