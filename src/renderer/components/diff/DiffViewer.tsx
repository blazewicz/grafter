import {
  ArrowLeftRight,
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
import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type {
  DiffFilePatch,
  DiffFileSummary,
  DiffLine,
  DiffSession,
  EditorTool,
} from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';
import { githubFileUrl } from '../../../shared/github';
import { VisualStudioCodeMark } from '../ui/BrandMarks';
import { BranchPicker } from '../branches/BranchPicker';
import {
  buildDiffTree,
  diffDirectoryPaths,
  filterDiffFiles,
  flattenDiffTree,
} from './diff-tree';
import type { DiffTreeNode } from './diff-tree';
import { calculateDiffScrollCorrection } from './diff-scroll';
import {
  DiffFileContextMenu,
  type DiffFileContextMenuState,
} from './DiffFileContextMenu';
import { DiffFileStatusIcon } from './DiffFileStatusIcon';
import {
  DiffLineContextMenu,
  type DiffLineContextMenuState,
} from './DiffLineContextMenu';
import { diffLineCopyText, diffLineRange, diffLineTarget } from './diff-line-context';
import styles from './DiffViewer.module.css';

const editorOptions: readonly { id: EditorTool; label: string }[] = [
  { id: 'vscode', label: 'Visual Studio Code' },
];
const contextMenuWidth = 228;
const contextMenuMargin = 8;
const fileContextMenuHeight = 147;
const lineContextMenuHeight = 214;

export function DiffViewer({
  session,
  onSessionChange,
  onClose,
  onError,
}: {
  session: DiffSession;
  onSessionChange: (session: DiffSession) => void;
  onClose: () => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const diffPaneRef = useRef<HTMLDivElement>(null);
  const branchControlsRef = useRef<HTMLDivElement>(null);
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
  const [fileContextMenu, setFileContextMenu] = useState<DiffFileContextMenuState>();
  const [lineContextMenu, setLineContextMenu] = useState<DiffLineContextMenuState>();
  const [branchMenu, setBranchMenu] = useState<'source' | 'target'>();
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [comparing, setComparing] = useState(false);
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

  useEffect(() => {
    if (!branchMenu) return;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!branchControlsRef.current?.contains(event.target as Node)) {
        setBranchMenu(undefined);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [branchMenu]);

  useEffect(() => {
    if (!branchMenu || branches.length) return;
    let active = true;
    void api
      .listBranches(session.projectId)
      .then((next) => {
        if (active) setBranches(next);
      })
      .catch((caught: unknown) => {
        if (active) onError(friendlyError(caught));
      })
      .finally(() => {
        if (active) setLoadingBranches(false);
      });
    return () => {
      active = false;
    };
  }, [branchMenu, branches.length, onError, session.projectId]);

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
    const updateSelection = (): void => updateDiffLineSelection(pane);
    document.addEventListener('selectionchange', updateSelection);
    return () => {
      document.removeEventListener('selectionchange', updateSelection);
      clearDiffLineSelection(pane);
    };
  }, []);

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
    setFileContextMenu(undefined);
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

  const compareBranches = (sourceBranch: string, targetBranch: string): void => {
    setBranchMenu(undefined);
    if (
      comparing ||
      (sourceBranch === session.branch && targetBranch === session.targetBranch)
    ) {
      return;
    }
    setComparing(true);
    void api
      .openBranchDiff({
        projectId: session.projectId,
        sourceBranch,
        targetBranch,
      })
      .then(onSessionChange)
      .catch((caught: unknown) => onError(friendlyError(caught)))
      .finally(() => setComparing(false));
  };

  const toggleBranchMenu = (menu: 'source' | 'target'): void => {
    if (branchMenu !== menu && !branches.length) setLoadingBranches(true);
    setBranchMenu((current) => (current === menu ? undefined : menu));
  };

  const openFileContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    file: DiffFileSummary,
  ): void => {
    event.preventDefault();
    const position = contextMenuPosition(event, fileContextMenuHeight);
    const deleted = file.status === 'deleted';
    const path = deleted ? (file.previousPath ?? file.path) : file.path;
    const revision = deleted ? session.baseSha : session.headSha;
    setLineContextMenu(undefined);
    setFileContextMenu({
      ...position,
      fileId: file.id,
      path,
      ...(session.githubRepository
        ? { githubUrl: githubFileUrl(session.githubRepository, revision, path) }
        : {}),
      editorAvailable: !deleted && session.sourceWorktreeId !== undefined,
    });
  };

  const closeFileContextMenu = useCallback(() => setFileContextMenu(undefined), []);

  const openContextFileInEditor = (): void => {
    if (!fileContextMenu) return;
    void api
      .openDiffFileInEditor({
        sessionId: session.id,
        fileId: fileContextMenu.fileId,
        editor: 'vscode',
      })
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  const openContextFileOnGitHub = (): void => {
    if (!fileContextMenu?.githubUrl) return;
    void api
      .openExternal(fileContextMenu.githubUrl)
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  const openLineContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    file: DiffFileSummary,
    line: DiffLine,
    selection?: DiffLineSelection,
  ): void => {
    const target = diffLineTarget(session, file, line);
    if (!target) return;
    event.preventDefault();
    const lineId = event.currentTarget.dataset.diffLineId;
    if (!lineId) return;
    const position = contextMenuPosition(event, lineContextMenuHeight);
    const range = diffLineRange(target, selection?.lines);
    setFileContextMenu(undefined);
    setLineContextMenu({
      ...position,
      fileId: file.id,
      lineId,
      range,
      target,
      copyText: diffLineCopyText(line.text, selection?.text),
      ...(session.githubRepository
        ? {
            githubUrl: githubFileUrl(
              session.githubRepository,
              target.revision,
              target.path,
              range.startLine,
              range.endLine,
            ),
          }
        : {}),
      editorAvailable:
        file.status !== 'deleted' && session.sourceWorktreeId !== undefined,
    });
  };

  const closeLineContextMenu = useCallback(() => setLineContextMenu(undefined), []);

  const copyContextText = (text: string): void => {
    void api.copyText(text).catch((caught: unknown) => onError(friendlyError(caught)));
  };

  const openContextLineInEditor = (): void => {
    if (!lineContextMenu) return;
    void api
      .openDiffFileInEditor({
        sessionId: session.id,
        fileId: lineContextMenu.fileId,
        editor: 'vscode',
        line: lineContextMenu.target.line,
      })
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  const openContextLineOnGitHub = (): void => {
    if (!lineContextMenu?.githubUrl) return;
    void api
      .openExternal(lineContextMenu.githubUrl)
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
        if (branchMenu) {
          setBranchMenu(undefined);
          return;
        }
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
              <div className={styles.branchControls} ref={branchControlsRef}>
                <div className={styles.branchControl}>
                  <button
                    className={styles.branchButton}
                    aria-label="Choose source branch"
                    aria-haspopup="dialog"
                    aria-expanded={branchMenu === 'source'}
                    disabled={comparing}
                    onClick={() => toggleBranchMenu('source')}
                  >
                    <code>{session.branch}</code>
                    <ChevronDown size={11} />
                  </button>
                  {branchMenu === 'source' && (
                    <div
                      className={styles.branchMenu}
                      role="dialog"
                      aria-label="Choose source branch"
                    >
                      <BranchPicker
                        branches={branches}
                        selectedBranch={session.branch}
                        disabledBranches={[session.targetBranch]}
                        disableCheckedOut={false}
                        loading={loadingBranches}
                        onSelect={(branch) =>
                          compareBranches(branch, session.targetBranch)
                        }
                      />
                    </div>
                  )}
                </div>
                <button
                  className={styles.swapBranchesButton}
                  aria-label="Swap source and destination branches"
                  title="Swap branches"
                  disabled={comparing}
                  onClick={() => compareBranches(session.targetBranch, session.branch)}
                >
                  {comparing ? (
                    <LoaderCircle className="spin" size={11} />
                  ) : (
                    <ArrowLeftRight size={11} />
                  )}
                </button>
                <div className={styles.branchControl}>
                  <button
                    className={styles.branchButton}
                    aria-label="Choose destination branch"
                    aria-haspopup="dialog"
                    aria-expanded={branchMenu === 'target'}
                    disabled={comparing}
                    onClick={() => toggleBranchMenu('target')}
                  >
                    <code>{session.targetBranch}</code>
                    <ChevronDown size={11} />
                  </button>
                  {branchMenu === 'target' && (
                    <div
                      className={styles.branchMenu}
                      role="dialog"
                      aria-label="Choose destination branch"
                    >
                      <BranchPicker
                        branches={branches}
                        selectedBranch={session.targetBranch}
                        disabledBranches={[session.branch]}
                        disableCheckedOut={false}
                        loading={loadingBranches}
                        onSelect={(branch) => compareBranches(session.branch, branch)}
                      />
                    </div>
                  )}
                </div>
              </div>
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
                  setFileContextMenu(undefined);
                  setLineContextMenu(undefined);
                  setQuery(event.target.value);
                }}
              />
            </label>
            <div className={styles.fileCount}>
              {filteredFiles.length} of {session.files.length}{' '}
              {session.files.length === 1 ? 'file' : 'files'}
            </div>
            <nav
              className={styles.fileTree}
              aria-label="Changed file tree"
              data-context-menu-open={fileContextMenu ? 'true' : undefined}
              onScroll={closeFileContextMenu}
            >
              {tree.length ? (
                <TreeNodes
                  nodes={tree}
                  depth={0}
                  expanded={expanded}
                  forceExpanded={filtering}
                  activeFileId={displayedActiveFileId}
                  contextFileId={fileContextMenu?.fileId}
                  onToggle={toggleDirectory}
                  onSelect={selectFile}
                  onContextMenu={openFileContextMenu}
                />
              ) : (
                <div className={styles.emptyTree}>No matching files</div>
              )}
            </nav>
          </aside>

          <div
            ref={diffPaneRef}
            className={styles.diffPane}
            data-context-menu-open={lineContextMenu ? 'true' : undefined}
            onScroll={closeLineContextMenu}
          >
            {orderedFiles.length ? (
              orderedFiles.map((file) => (
                <DiffFile
                  key={file.id}
                  file={file}
                  patch={patches.get(file.id)}
                  loading={loading.has(file.id)}
                  error={fileErrors.get(file.id)}
                  copied={copiedFileId === file.id}
                  contextLineId={lineContextMenu?.lineId}
                  expanded={!collapsedFileIds.has(file.id)}
                  editorAvailable={session.sourceWorktreeId !== undefined}
                  scrollRoot={diffPaneRef}
                  onVisible={requestPatch}
                  onCopy={() => copyPath(file)}
                  onOpenInEditor={(editor) => openFileInEditor(file, editor)}
                  onToggle={() => toggleFile(file.id)}
                  onLineContextMenu={(event, line, selection) =>
                    openLineContextMenu(event, file, line, selection)
                  }
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
        {fileContextMenu && (
          <DiffFileContextMenu
            state={fileContextMenu}
            onClose={closeFileContextMenu}
            onCopy={copyContextText}
            onOpenEditor={openContextFileInEditor}
            onOpenGitHub={openContextFileOnGitHub}
          />
        )}
        {lineContextMenu && (
          <DiffLineContextMenu
            state={lineContextMenu}
            onClose={closeLineContextMenu}
            onCopy={copyContextText}
            onOpenEditor={openContextLineInEditor}
            onOpenGitHub={openContextLineOnGitHub}
          />
        )}
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
  contextFileId,
  onToggle,
  onSelect,
  onContextMenu,
}: {
  nodes: DiffTreeNode[];
  depth: number;
  expanded: Set<string>;
  forceExpanded: boolean;
  activeFileId: string | undefined;
  contextFileId: string | undefined;
  onToggle: (path: string) => void;
  onSelect: (fileId: string) => void;
  onContextMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    file: DiffFileSummary,
  ) => void;
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
                  contextFileId={contextFileId}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onContextMenu={onContextMenu}
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
            data-context-menu-anchor={node.file.id === contextFileId}
            data-status={node.file.status}
            title={node.file.path}
            onClick={() => onSelect(node.file.id)}
            onContextMenu={(event) => onContextMenu(event, node.file)}
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
  contextLineId,
  expanded,
  editorAvailable,
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

interface DiffLineSelection {
  text: string;
  lines: DiffLine[];
}

interface DiffLineDomSelection {
  text: string;
  rowIds: Set<string>;
}

function selectionWithinFile(lineElement: HTMLElement): DiffLineDomSelection | undefined {
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

function selectedDiffLines(
  patch: DiffFilePatch,
  selectedRowIds: ReadonlySet<string>,
): DiffLine[] {
  return patch.hunks.flatMap((hunk, hunkIndex) =>
    hunk.lines.filter((_line, lineIndex) =>
      selectedRowIds.has(diffLineRowId(patch.fileId, hunkIndex, lineIndex)),
    ),
  );
}

function updateDiffLineSelection(pane: HTMLElement | null): void {
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

function clearDiffLineSelection(pane: HTMLElement | null): void {
  for (const row of pane?.querySelectorAll<HTMLElement>('[data-selected]') ?? []) {
    delete row.dataset.selected;
  }
}

function parentElement(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function diffLineRowId(fileId: string, hunkIndex: number, lineIndex: number): string {
  return `${fileId}:${hunkIndex}:${lineIndex}`;
}

function contextMenuPosition(
  event: ReactMouseEvent<HTMLElement>,
  menuHeight: number,
): {
  x: number;
  y: number;
} {
  const bounds = event.currentTarget.getBoundingClientRect();
  const requestedX = event.clientX || bounds.left + 72;
  const requestedY = event.clientY || bounds.top + bounds.height;
  return {
    x: Math.max(
      contextMenuMargin,
      Math.min(requestedX, window.innerWidth - contextMenuWidth - contextMenuMargin),
    ),
    y: Math.max(
      contextMenuMargin,
      Math.min(requestedY, window.innerHeight - menuHeight - contextMenuMargin),
    ),
  };
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
