import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type {
  DiffFileSummary,
  DiffLine,
  DiffSession,
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
import {
  DiffFileContextMenu,
  type DiffFileContextMenuState,
} from './DiffFileContextMenu';
import { DiffFilesPane } from './DiffFilesPane';
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
  const [fileContextMenu, setFileContextMenu] = useState<DiffFileContextMenuState>();
  const [lineContextMenu, setLineContextMenu] = useState<DiffLineContextMenuState>();
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

  const selectFile = (fileId: string): void => {
    setFileContextMenu(undefined);
    navigateToFile(fileId);
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

          <DiffFilesPane
            session={session}
            files={orderedFiles}
            patches={patches}
            loading={loading}
            fileErrors={fileErrors}
            filtering={filtering}
            query={query}
            contextLineId={lineContextMenu?.lineId}
            scrollRoot={diffPaneRef}
            onVisible={requestPatch}
            onScroll={closeLineContextMenu}
            onLineContextMenu={openLineContextMenu}
            onError={onError}
          />
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
