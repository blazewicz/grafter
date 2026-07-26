import { GitCommitHorizontal, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type {
  DiffFileSummary,
  DiffLine,
  DiffSession,
  EditorTool,
  Settings,
} from '../../../shared/contracts';
import { githubFileUrl } from '../../../shared/github';
import { api, friendlyError } from '../../grafter-api';
import {
  buildDiffTree,
  diffDirectoryPaths,
  filterDiffFiles,
  flattenDiffTree,
} from './diff-tree';
import { DiffFile } from './DiffFile';
import {
  DiffFileContextMenu,
  type DiffFileContextMenuState,
} from './DiffFileContextMenu';
import { DiffFileTree } from './DiffFileTree';
import {
  type DiffLineSelection,
  clearDiffLineSelection,
  updateDiffLineSelection,
} from './diff-line-selection';
import { diffLineCopyText, diffLineRange, diffLineTarget } from './diff-line-context';
import {
  DiffLineContextMenu,
  type DiffLineContextMenuState,
} from './DiffLineContextMenu';
import { DiffViewerToolbar } from './DiffViewerToolbar';
import { useDiffNavigation } from './useDiffNavigation';
import { useDiffPatches } from './useDiffPatches';
import styles from './DiffViewer.module.css';

const contextMenuWidth = 228;
const contextMenuMargin = 8;
const fileContextMenuHeight = 147;
const lineContextMenuHeight = 214;

export function DiffViewer({
  session,
  onSessionChange,
  onClose,
  onError,
  settings,
  systemLocale,
}: {
  session: DiffSession;
  onSessionChange: (session: DiffSession) => void;
  onClose: () => void;
  onError: (message: string) => void;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(
    () => new Set(diffDirectoryPaths(session.files)),
  );
  const [collapsedFileIds, setCollapsedFileIds] = useState<Set<string>>(new Set());
  const [copiedFileId, setCopiedFileId] = useState<string>();
  const [fileContextMenu, setFileContextMenu] = useState<DiffFileContextMenuState>();
  const [lineContextMenu, setLineContextMenu] = useState<DiffLineContextMenuState>();
  const copyResetTimer = useRef<number | undefined>(undefined);
  const filteredFiles = useMemo(
    () => filterDiffFiles(session.files, query),
    [query, session.files],
  );
  const tree = useMemo(() => buildDiffTree(filteredFiles), [filteredFiles]);
  const orderedFiles = useMemo(() => flattenDiffTree(tree), [tree]);
  const filtering = query.trim().length > 0;
  const { patches, loading, fileErrors, requestPatch } = useDiffPatches(session.id);
  const {
    diffPaneRef,
    displayedActiveFileId,
    clearPendingTarget,
    selectFile: navigateToFile,
  } = useDiffNavigation(orderedFiles, loading);

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
    const pane = diffPaneRef.current;
    const updateSelection = (): void => updateDiffLineSelection(pane);
    document.addEventListener('selectionchange', updateSelection);
    return () => {
      document.removeEventListener('selectionchange', updateSelection);
      clearDiffLineSelection(pane);
    };
  }, [diffPaneRef]);

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
    navigateToFile(fileId);
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
      editorAvailable:
        session.kind === 'branch' && !deleted && session.sourceWorktreeId !== undefined,
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
        session.kind === 'branch' &&
        file.status !== 'deleted' &&
        session.sourceWorktreeId !== undefined,
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
      aria-label={
        session.kind === 'branch'
          ? `Committed changes from ${session.branch} against ${session.targetBranch}`
          : `Changes in commit ${session.commit.hash}`
      }
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
        <DiffViewerToolbar
          session={session}
          settings={settings}
          systemLocale={systemLocale}
          onSessionChange={onSessionChange}
          onClose={onClose}
          onError={onError}
        />

        <div className={styles.viewer}>
          <aside className={styles.fileSidebar} aria-label="Changed files">
            <label className={styles.filter}>
              <Search size={14} />
              <input
                value={query}
                placeholder="Filter files…"
                aria-label="Filter changed files"
                onChange={(event) => {
                  clearPendingTarget();
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
                <DiffFileTree
                  nodes={tree}
                  expanded={expanded}
                  forceExpanded={filtering}
                  activeFileId={displayedActiveFileId}
                  contextFileId={fileContextMenu?.fileId}
                  onToggle={toggleDirectory}
                  onSelect={selectFile}
                  onContextMenu={openFileContextMenu}
                />
              ) : (
                <div className={styles.emptyTree}>
                  {filtering ? 'No matching files' : 'No changed files'}
                </div>
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
                  editorAvailable={
                    session.kind === 'branch' && session.sourceWorktreeId !== undefined
                  }
                  showEditorControls={session.kind === 'branch'}
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
                {filtering ? (
                  <>
                    <Search size={20} />
                    <strong>No files match “{query.trim()}”</strong>
                    <span>Try another path or file name.</span>
                  </>
                ) : (
                  <>
                    <GitCommitHorizontal size={20} />
                    <strong>
                      {session.kind === 'commit'
                        ? 'This commit has no file changes'
                        : 'These branches have no committed changes'}
                    </strong>
                  </>
                )}
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
