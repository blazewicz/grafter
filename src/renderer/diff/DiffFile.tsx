import { Check, ChevronDown, ChevronRight, FileCode2, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type {
  DiffFilePatch,
  DiffFileSummary,
  DiffLine,
  EditorTool,
} from '../../shared/contracts';
import { VisualStudioCodeMark } from '../ui/BrandMarks';
import { CopyButton } from '../ui/CopyButton';
import {
  diffLineRowId,
  selectedDiffLines,
  selectionWithinFile,
  type DiffLineSelection,
} from './diff-line-selection';
import { DiffFileStatusIcon } from './DiffFileStatusIcon';
import { diffFileElementId } from './useDiffNavigation';
import styles from './DiffViewer.module.css';

const editorOptions: readonly { id: EditorTool; label: string }[] = [
  { id: 'vscode', label: 'Visual Studio Code' },
];

export function DiffFile({
  file,
  patch,
  loading,
  error,
  copied,
  contextLineId,
  expanded,
  editorAvailable,
  showEditorControls,
  scrollRoot,
  onVisible,
  onCopy,
  onOpenInEditor,
  onToggle,
  onLineContextMenu,
}: {
  file: DiffFileSummary;
  patch: DiffFilePatch | undefined;
  loading: boolean;
  error: string | undefined;
  copied: boolean;
  contextLineId: string | undefined;
  expanded: boolean;
  editorAvailable: boolean;
  showEditorControls: boolean;
  scrollRoot: RefObject<HTMLDivElement | null>;
  onVisible: (file: DiffFileSummary) => void;
  onCopy: () => void;
  onOpenInEditor: (editor: EditorTool) => void;
  onToggle: () => void;
  onLineContextMenu: (
    event: ReactMouseEvent<HTMLDivElement>,
    line: DiffLine,
    selection?: DiffLineSelection,
  ) => void;
}): React.JSX.Element {
  const fileRef = useRef<HTMLElement>(null);
  const editorMenuRef = useRef<HTMLDivElement>(null);
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [editor, setEditor] = useState<EditorTool>('vscode');
  const editorUnavailableReason =
    file.status === 'deleted'
      ? 'Deleted files cannot be opened in an editor'
      : !editorAvailable
        ? 'Check out the source branch in a worktree to open files in an editor'
        : undefined;
  const selectedEditorLabel =
    editorOptions.find((option) => option.id === editor)?.label ?? 'IDE';

  useEffect(() => {
    if (!expanded) return;
    const element = fileRef.current;
    if (!element) return;
    const preloadObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        onVisible(file);
      },
      {
        root: scrollRoot.current,
        rootMargin: '700px 0px',
        threshold: 0,
      },
    );
    preloadObserver.observe(element);
    return () => {
      preloadObserver.disconnect();
    };
  }, [expanded, file, onVisible, scrollRoot]);

  useEffect(() => {
    if (!editorMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!editorMenuRef.current?.contains(event.target as Node)) {
        setEditorMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setEditorMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [editorMenuOpen]);

  const openInEditor = (nextEditor: EditorTool): void => {
    setEditor(nextEditor);
    setEditorMenuOpen(false);
    onOpenInEditor(nextEditor);
  };

  return (
    <section
      ref={fileRef}
      id={diffFileElementId(file.id)}
      className={styles.file}
      data-diff-file-id={file.id}
    >
      <header className={styles.fileHeader} data-expanded={expanded}>
        <div className={styles.filePath} title={file.path}>
          <button
            className={styles.collapseButton}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${file.path} diff`}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            <ChevronRight className={styles.fileChevron} data-open={expanded} size={13} />
          </button>
          <DiffFileStatusIcon status={file.status} size={14} />
          {file.previousPath && (
            <>
              <code className={styles.previousPath}>{file.previousPath}</code>
              <ChevronRight size={12} />
            </>
          )}
          <code>{file.path}</code>
          <CopyButton
            copied={copied}
            copyLabel={`Copy ${file.path} path`}
            copiedLabel="File path copied"
            onCopy={onCopy}
            className={styles.fileCopyButton}
          />
        </div>
        <div className={styles.fileHeaderActions}>
          <div className={styles.fileStats}>
            {file.binary ? (
              <span>binary</span>
            ) : (
              <>
                <strong className={styles.additions}>+{file.additions ?? 0}</strong>
                <strong className={styles.deletions}>−{file.deletions ?? 0}</strong>
              </>
            )}
          </div>
          {showEditorControls && (
            <div
              className={styles.editorPicker}
              ref={editorMenuRef}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || !editorMenuOpen) return;
                event.preventDefault();
                event.stopPropagation();
                setEditorMenuOpen(false);
              }}
            >
              <div className={styles.editorSplitButton}>
                <button
                  className={styles.editorOpenButton}
                  disabled={editorUnavailableReason !== undefined}
                  title={editorUnavailableReason ?? `Open in ${selectedEditorLabel}`}
                  aria-label={
                    editorUnavailableReason === undefined
                      ? `Open ${file.path} in ${selectedEditorLabel}`
                      : `${file.path}: ${editorUnavailableReason}`
                  }
                  onClick={() => openInEditor(editor)}
                >
                  <VisualStudioCodeMark />
                </button>
                <button
                  className={styles.editorMenuButton}
                  disabled={editorUnavailableReason !== undefined}
                  title={editorUnavailableReason ?? 'Choose IDE'}
                  aria-label={
                    editorUnavailableReason
                      ? `${file.path}: ${editorUnavailableReason}`
                      : `Choose IDE for ${file.path}`
                  }
                  aria-haspopup="menu"
                  aria-expanded={editorMenuOpen}
                  onClick={() => setEditorMenuOpen((menuOpen) => !menuOpen)}
                >
                  <ChevronDown size={11} />
                </button>
              </div>
              {editorMenuOpen && (
                <div className={styles.editorMenu} role="menu">
                  {editorOptions.map((option) => (
                    <button
                      key={option.id}
                      role="menuitem"
                      onClick={() => openInEditor(option.id)}
                    >
                      <VisualStudioCodeMark />
                      <span>{option.label}</span>
                      {option.id === editor && <Check size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      {expanded && (
        <div className={styles.patch}>
          {error ? (
            <div className={styles.patchMessage}>
              <strong>Could not load this file</strong>
              <span>{error}</span>
            </div>
          ) : file.binary || patch?.binary ? (
            <div className={styles.patchMessage}>
              <FileCode2 size={18} />
              <strong>Binary file changed</strong>
              <span>Grafter cannot display a textual diff for this file.</span>
            </div>
          ) : patch ? (
            patch.hunks.length ? (
              patch.hunks.map((hunk, index) => (
                <div className={styles.hunk} key={`${file.id}:${index}`}>
                  <div className={styles.hunkHeader}>
                    <code>{hunk.header}</code>
                  </div>
                  {hunk.lines.map((line, lineIndex) => (
                    <DiffLineRow
                      key={`${file.id}:${index}:${lineIndex}`}
                      id={diffLineRowId(file.id, index, lineIndex)}
                      contextMenuAnchor={
                        contextLineId === diffLineRowId(file.id, index, lineIndex)
                      }
                      line={line}
                      onContextMenu={(event) => {
                        const selection = selectionWithinFile(event.currentTarget);
                        onLineContextMenu(
                          event,
                          line,
                          selection
                            ? {
                                text: selection.text,
                                lines: selectedDiffLines(patch, selection.rowIds),
                              }
                            : undefined,
                        );
                      }}
                    />
                  ))}
                </div>
              ))
            ) : (
              <div className={styles.patchMessage}>
                <strong>No textual lines changed</strong>
                <span>The file mode or metadata changed.</span>
              </div>
            )
          ) : (
            <div className={styles.patchLoading}>
              {loading ? <LoaderCircle className="spin" size={16} /> : null}
              <span>{loading ? 'Loading patch…' : 'Patch will load when visible'}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DiffLineRow({
  id,
  contextMenuAnchor,
  line,
  onContextMenu,
}: {
  id: string;
  contextMenuAnchor: boolean;
  line: DiffLine;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
}): React.JSX.Element {
  const marker = line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '−' : ' ';
  return (
    <div
      className={styles.line}
      data-context-menu-anchor={contextMenuAnchor || undefined}
      data-kind={line.kind}
      data-diff-line-id={id}
      onContextMenu={onContextMenu}
    >
      <span className={styles.lineNumber}>{line.oldLine}</span>
      <span className={styles.lineNumber}>{line.newLine}</span>
      <span className={styles.lineMarker}>{marker}</span>
      <code>{line.text || ' '}</code>
    </div>
  );
}
