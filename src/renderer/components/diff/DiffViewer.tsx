import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  Folder,
  GitCompareArrows,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type {
  DiffFilePatch,
  DiffFileSummary,
  DiffLine,
  DiffSession,
  EditorTool,
} from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';
import { VisualStudioCodeMark } from '../ui/BrandMarks';
import {
  buildDiffTree,
  diffDirectoryPaths,
  filterDiffFiles,
  flattenDiffTree,
} from './diff-tree';
import type { DiffTreeNode } from './diff-tree';
import { calculateDiffScrollCorrection } from './diff-scroll';
import { DiffFileStatusIcon } from './DiffFileStatusIcon';
import styles from './DiffViewer.module.css';

const editorOptions: readonly { id: EditorTool; label: string }[] = [
  { id: 'vscode', label: 'Visual Studio Code' },
];

export function DiffViewer({
  session,
  onClose,
  onError,
}: {
  session: DiffSession;
  onClose: () => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const diffPaneRef = useRef<HTMLDivElement>(null);
  const requestedFiles = useRef(new Set<string>());
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(
    () => new Set(diffDirectoryPaths(session.files)),
  );
  const [patches, setPatches] = useState<Map<string, DiffFilePatch>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [fileErrors, setFileErrors] = useState<Map<string, string>>(new Map());
  const [collapsedFileIds, setCollapsedFileIds] = useState<Set<string>>(new Set());
  const [activeFileId, setActiveFileId] = useState<string>();
  const [pendingTargetId, setPendingTargetId] = useState<string>();
  const [copiedFileId, setCopiedFileId] = useState<string>();
  const copyResetTimer = useRef<number | undefined>(undefined);
  const loadingFiles = useRef(loading);
  const filteredFiles = useMemo(
    () => filterDiffFiles(session.files, query),
    [query, session.files],
  );
  const tree = useMemo(() => buildDiffTree(filteredFiles), [filteredFiles]);
  const orderedFiles = useMemo(() => flattenDiffTree(tree), [tree]);
  const filtering = query.trim().length > 0;
  const displayedActiveFileId =
    pendingTargetId && orderedFiles.some((file) => file.id === pendingTargetId)
      ? pendingTargetId
      : activeFileId && orderedFiles.some((file) => file.id === activeFileId)
        ? activeFileId
        : orderedFiles[0]?.id;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(
    () => () => {
      if (copyResetTimer.current !== undefined) {
        window.clearTimeout(copyResetTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    loadingFiles.current = loading;
  }, [loading]);

  useEffect(() => {
    const pane = diffPaneRef.current;
    if (!pane) return;

    const updateActiveFile = (): void => {
      const paneTop = pane.getBoundingClientRect().top;
      const files = pane.querySelectorAll<HTMLElement>('[data-diff-file-id]');
      let closestId = files[0]?.dataset.diffFileId;
      for (const file of files) {
        if (file.getBoundingClientRect().top > paneTop + 70) break;
        closestId = file.dataset.diffFileId;
      }
      if (closestId) setActiveFileId(closestId);
    };

    pane.addEventListener('scroll', updateActiveFile, { passive: true });
    return () => pane.removeEventListener('scroll', updateActiveFile);
  }, [orderedFiles]);

  useEffect(() => {
    if (!pendingTargetId) return;
    const pane = diffPaneRef.current;
    const targetIndex = orderedFiles.findIndex((file) => file.id === pendingTargetId);
    const target = document.getElementById(diffFileElementId(pendingTargetId));
    if (!pane || !target || targetIndex === -1) return;

    const relevantFileIds = new Set(
      orderedFiles.slice(0, targetIndex + 1).map((file) => file.id),
    );
    let active = true;
    let alignmentFrame: number | undefined;
    let settleTimer: number | undefined;
    let quietChecks = 0;
    let initialResizeDelivered = false;

    const clearScheduledWork = (): void => {
      if (alignmentFrame !== undefined) window.cancelAnimationFrame(alignmentFrame);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    };

    const finishWhenSettled = (): void => {
      if (!active) return;
      const relevantFileLoading = [...loadingFiles.current].some((fileId) =>
        relevantFileIds.has(fileId),
      );
      const correction = diffScrollCorrection(pane, target);
      if (Math.abs(correction) > 1) {
        quietChecks = 0;
        pane.scrollTop += correction;
      } else if (!relevantFileLoading) {
        quietChecks += 1;
        if (quietChecks >= 2) {
          setActiveFileId(pendingTargetId);
          setPendingTargetId((current) =>
            current === pendingTargetId ? undefined : current,
          );
          return;
        }
      } else {
        quietChecks = 0;
      }
      settleTimer = window.setTimeout(finishWhenSettled, 150);
    };

    const scheduleAlignment = (): void => {
      quietChecks = 0;
      if (alignmentFrame !== undefined) window.cancelAnimationFrame(alignmentFrame);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      alignmentFrame = window.requestAnimationFrame(() => {
        alignmentFrame = undefined;
        if (!active) return;
        const correction = diffScrollCorrection(pane, target);
        if (Math.abs(correction) > 1) pane.scrollTop += correction;
        settleTimer = window.setTimeout(finishWhenSettled, 300);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      if (!initialResizeDelivered) {
        initialResizeDelivered = true;
        settleTimer = window.setTimeout(finishWhenSettled, 400);
        return;
      }
      scheduleAlignment();
    });
    for (const file of pane.querySelectorAll<HTMLElement>('[data-diff-file-id]')) {
      if (!relevantFileIds.has(file.dataset.diffFileId ?? '')) continue;
      resizeObserver.observe(file);
    }

    const cancelPendingTarget = (): void => {
      setPendingTargetId((current) =>
        current === pendingTargetId ? undefined : current,
      );
    };
    const cancelOnNavigationKey = (event: KeyboardEvent): void => {
      if (
        ['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '].includes(
          event.key,
        )
      ) {
        cancelPendingTarget();
      }
    };

    pane.addEventListener('scrollend', scheduleAlignment);
    pane.addEventListener('wheel', cancelPendingTarget, { passive: true });
    pane.addEventListener('pointerdown', cancelPendingTarget, { passive: true });
    pane.addEventListener('touchstart', cancelPendingTarget, { passive: true });
    pane.addEventListener('keydown', cancelOnNavigationKey);
    return () => {
      active = false;
      clearScheduledWork();
      resizeObserver.disconnect();
      pane.removeEventListener('scrollend', scheduleAlignment);
      pane.removeEventListener('wheel', cancelPendingTarget);
      pane.removeEventListener('pointerdown', cancelPendingTarget);
      pane.removeEventListener('touchstart', cancelPendingTarget);
      pane.removeEventListener('keydown', cancelOnNavigationKey);
    };
  }, [orderedFiles, pendingTargetId]);

  const requestPatch = useCallback(
    (file: DiffFileSummary): void => {
      if (requestedFiles.current.has(file.id)) return;
      requestedFiles.current.add(file.id);
      setLoading((current) => new Set(current).add(file.id));
      void api
        .getDiffFile({ sessionId: session.id, fileId: file.id })
        .then((patch) => {
          setPatches((current) => new Map(current).set(file.id, patch));
        })
        .catch((caught: unknown) => {
          setFileErrors((current) =>
            new Map(current).set(file.id, friendlyError(caught)),
          );
        })
        .finally(() => {
          setLoading((current) => {
            const next = new Set(current);
            next.delete(file.id);
            return next;
          });
        });
    },
    [session.id],
  );

  const toggleDirectory = (path: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleFile = (fileId: string): void => {
    setCollapsedFileIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const selectFile = (fileId: string): void => {
    setActiveFileId(fileId);
    setPendingTargetId(fileId);
    document
      .getElementById(diffFileElementId(fileId))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const copyPath = (file: DiffFileSummary): void => {
    void api
      .copyText(file.path)
      .then(() => {
        setCopiedFileId(file.id);
        if (copyResetTimer.current !== undefined) {
          window.clearTimeout(copyResetTimer.current);
        }
        copyResetTimer.current = window.setTimeout(
          () => setCopiedFileId(undefined),
          1600,
        );
      })
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  const openFileInEditor = (file: DiffFileSummary, editor: EditorTool): void => {
    void api
      .openDiffFileInEditor({ sessionId: session.id, fileId: file.id, editor })
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={`Committed changes from ${session.branch} against ${session.targetBranch}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.surface}>
        <header className={styles.toolbar}>
          <div className={styles.toolbarTitle}>
            <GitCompareArrows size={16} />
            <div>
              <strong>Comparing</strong>
              <span>
                <code>{session.branch}</code>
                <ChevronRight size={12} />
                <code>{session.targetBranch}</code>
              </span>
            </div>
          </div>
          <div className={styles.totalStats} aria-label="Diff totals">
            <span>{session.stats.files} files</span>
            <strong className={styles.additions}>+{session.stats.additions}</strong>
            <strong className={styles.deletions}>−{session.stats.deletions}</strong>
          </div>
          <button
            className={styles.closeButton}
            aria-label="Close diff viewer"
            title="Close diff viewer"
            autoFocus
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        <div className={styles.viewer}>
          <aside className={styles.fileSidebar} aria-label="Changed files">
            <label className={styles.filter}>
              <Search size={14} />
              <input
                value={query}
                placeholder="Filter files…"
                aria-label="Filter changed files"
                onChange={(event) => {
                  setPendingTargetId(undefined);
                  setQuery(event.target.value);
                }}
              />
            </label>
            <div className={styles.fileCount}>
              {filteredFiles.length} of {session.files.length}{' '}
              {session.files.length === 1 ? 'file' : 'files'}
            </div>
            <nav className={styles.fileTree} aria-label="Changed file tree">
              {tree.length ? (
                <TreeNodes
                  nodes={tree}
                  depth={0}
                  expanded={expanded}
                  forceExpanded={filtering}
                  activeFileId={displayedActiveFileId}
                  onToggle={toggleDirectory}
                  onSelect={selectFile}
                />
              ) : (
                <div className={styles.emptyTree}>No matching files</div>
              )}
            </nav>
          </aside>

          <div ref={diffPaneRef} className={styles.diffPane}>
            {orderedFiles.length ? (
              orderedFiles.map((file) => (
                <DiffFile
                  key={file.id}
                  file={file}
                  patch={patches.get(file.id)}
                  loading={loading.has(file.id)}
                  error={fileErrors.get(file.id)}
                  copied={copiedFileId === file.id}
                  expanded={!collapsedFileIds.has(file.id)}
                  scrollRoot={diffPaneRef}
                  onVisible={requestPatch}
                  onCopy={() => copyPath(file)}
                  onOpenInEditor={(editor) => openFileInEditor(file, editor)}
                  onToggle={() => toggleFile(file.id)}
                />
              ))
            ) : (
              <div className={styles.emptyDiff}>
                <Search size={20} />
                <strong>No files match “{query.trim()}”</strong>
                <span>Try another path or file name.</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </dialog>
  );
}

function TreeNodes({
  nodes,
  depth,
  expanded,
  forceExpanded,
  activeFileId,
  onToggle,
  onSelect,
}: {
  nodes: DiffTreeNode[];
  depth: number;
  expanded: Set<string>;
  forceExpanded: boolean;
  activeFileId: string | undefined;
  onToggle: (path: string) => void;
  onSelect: (fileId: string) => void;
}): React.JSX.Element {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'directory') {
          const open = forceExpanded || expanded.has(node.path);
          return (
            <div key={`directory:${node.path}`}>
              <button
                className={styles.treeRow}
                style={{ '--tree-depth': depth } as CSSProperties}
                aria-expanded={open}
                onClick={() => onToggle(node.path)}
              >
                <ChevronRight className={styles.treeChevron} data-open={open} size={12} />
                <Folder size={13} />
                <span>{node.name}</span>
              </button>
              {open && (
                <TreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  forceExpanded={forceExpanded}
                  activeFileId={activeFileId}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              )}
            </div>
          );
        }

        return (
          <button
            key={node.file.id}
            className={styles.treeRow}
            style={{ '--tree-depth': depth } as CSSProperties}
            data-active={node.file.id === activeFileId}
            data-status={node.file.status}
            title={node.file.path}
            onClick={() => onSelect(node.file.id)}
          >
            <span className={styles.treeSpacer} />
            <DiffFileStatusIcon status={node.file.status} size={13} />
            <span>{node.name}</span>
          </button>
        );
      })}
    </>
  );
}

function DiffFile({
  file,
  patch,
  loading,
  error,
  copied,
  expanded,
  scrollRoot,
  onVisible,
  onCopy,
  onOpenInEditor,
  onToggle,
}: {
  file: DiffFileSummary;
  patch: DiffFilePatch | undefined;
  loading: boolean;
  error: string | undefined;
  copied: boolean;
  expanded: boolean;
  scrollRoot: RefObject<HTMLDivElement | null>;
  onVisible: (file: DiffFileSummary) => void;
  onCopy: () => void;
  onOpenInEditor: (editor: EditorTool) => void;
  onToggle: () => void;
}): React.JSX.Element {
  const fileRef = useRef<HTMLElement>(null);
  const editorMenuRef = useRef<HTMLDivElement>(null);
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [editor, setEditor] = useState<EditorTool>('vscode');
  const editorUnavailable = file.status === 'deleted';
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
          <button
            className={styles.copyButton}
            aria-label={copied ? 'File path copied' : `Copy ${file.path} path`}
            title={copied ? 'File path copied' : 'Copy file path'}
            onClick={onCopy}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
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
          <div className={styles.editorPicker} ref={editorMenuRef}>
            <div className={styles.editorSplitButton}>
              <button
                className={styles.editorOpenButton}
                disabled={editorUnavailable}
                title={
                  editorUnavailable
                    ? 'Deleted files cannot be opened in an editor'
                    : `Open in ${selectedEditorLabel}`
                }
                aria-label={
                  editorUnavailable
                    ? `${file.path} cannot be opened because it was deleted`
                    : `Open ${file.path} in ${selectedEditorLabel}`
                }
                onClick={() => openInEditor(editor)}
              >
                <VisualStudioCodeMark />
              </button>
              <button
                className={styles.editorMenuButton}
                disabled={editorUnavailable}
                title="Choose IDE"
                aria-label={`Choose IDE for ${file.path}`}
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
                    <DiffLineRow key={`${file.id}:${index}:${lineIndex}`} line={line} />
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

function DiffLineRow({ line }: { line: DiffLine }): React.JSX.Element {
  const marker = line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '−' : ' ';
  return (
    <div className={styles.line} data-kind={line.kind}>
      <span className={styles.lineNumber}>{line.oldLine}</span>
      <span className={styles.lineNumber}>{line.newLine}</span>
      <span className={styles.lineMarker}>{marker}</span>
      <code>{line.text || ' '}</code>
    </div>
  );
}

function diffFileElementId(fileId: string): string {
  return `diff-viewer-${fileId}`;
}

function diffScrollCorrection(pane: HTMLElement, target: HTMLElement): number {
  const paneBounds = pane.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const scrollPaddingTop =
    Number.parseFloat(getComputedStyle(pane).scrollPaddingTop) || 0;
  return calculateDiffScrollCorrection({
    paneTop: paneBounds.top,
    targetTop: targetBounds.top,
    scrollTop: pane.scrollTop,
    scrollHeight: pane.scrollHeight,
    clientHeight: pane.clientHeight,
    scrollPaddingTop,
  });
}
