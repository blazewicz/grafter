import {
  Check,
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
} from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';
import {
  buildDiffTree,
  diffDirectoryPaths,
  filterDiffFiles,
  flattenDiffTree,
} from './diff-tree';
import type { DiffTreeNode } from './diff-tree';
import styles from './DiffViewer.module.css';

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
  const [activeFileId, setActiveFileId] = useState<string>();
  const [copiedFileId, setCopiedFileId] = useState<string>();
  const copyResetTimer = useRef<number | undefined>(undefined);
  const filteredFiles = useMemo(
    () => filterDiffFiles(session.files, query),
    [query, session.files],
  );
  const tree = useMemo(() => buildDiffTree(filteredFiles), [filteredFiles]);
  const orderedFiles = useMemo(() => flattenDiffTree(tree), [tree]);
  const filtering = query.trim().length > 0;
  const displayedActiveFileId =
    activeFileId && orderedFiles.some((file) => file.id === activeFileId)
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

  const selectFile = (fileId: string): void => {
    setActiveFileId(fileId);
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
                onChange={(event) => setQuery(event.target.value)}
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
                  scrollRoot={diffPaneRef}
                  onVisible={requestPatch}
                  onCopy={() => copyPath(file)}
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
            <FileCode2 size={13} />
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
  scrollRoot,
  onVisible,
  onCopy,
}: {
  file: DiffFileSummary;
  patch: DiffFilePatch | undefined;
  loading: boolean;
  error: string | undefined;
  copied: boolean;
  scrollRoot: RefObject<HTMLDivElement | null>;
  onVisible: (file: DiffFileSummary) => void;
  onCopy: () => void;
}): React.JSX.Element {
  const fileRef = useRef<HTMLElement>(null);

  useEffect(() => {
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
  }, [file, onVisible, scrollRoot]);

  return (
    <section
      ref={fileRef}
      id={diffFileElementId(file.id)}
      className={styles.file}
      data-diff-file-id={file.id}
    >
      <header className={styles.fileHeader}>
        <div className={styles.filePath} title={file.path}>
          <FileCode2 size={14} data-status={file.status} />
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
        <div className={styles.fileStats}>
          <span className={styles.statusLabel}>{statusLabel(file)}</span>
          {file.binary ? (
            <span>binary</span>
          ) : (
            <>
              <strong className={styles.additions}>+{file.additions ?? 0}</strong>
              <strong className={styles.deletions}>−{file.deletions ?? 0}</strong>
            </>
          )}
        </div>
      </header>
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

function statusLabel(file: DiffFileSummary): string {
  return file.status.replace('-', ' ');
}
