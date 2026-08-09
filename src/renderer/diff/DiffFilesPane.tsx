import { GitCommitHorizontal, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type {
  DiffFilePatch,
  DiffFileSummary,
  DiffLine,
  DiffSession,
  EditorTool,
  ToolPickerGroup,
} from '../../shared/contracts';
import { api, friendlyError } from '../grafter-api';
import { DiffFile } from './DiffFile';
import type { DiffLineSelection } from './diff-line-selection';
import styles from './DiffViewer.module.css';

export function DiffFilesPane({
  session,
  files,
  patches,
  loading,
  fileErrors,
  filtering,
  query,
  contextLineId,
  toolPreferences,
  onSetToolPreference,
  scrollRoot,
  onVisible,
  onScroll,
  onLineContextMenu,
  onError,
}: {
  session: DiffSession;
  files: readonly DiffFileSummary[];
  patches: ReadonlyMap<string, DiffFilePatch>;
  loading: ReadonlySet<string>;
  fileErrors: ReadonlyMap<string, string>;
  filtering: boolean;
  query: string;
  contextLineId: string | undefined;
  toolPreferences: Record<ToolPickerGroup, string>;
  onSetToolPreference: (group: ToolPickerGroup, tool: string) => void;
  scrollRoot: RefObject<HTMLDivElement | null>;
  onVisible: (file: DiffFileSummary) => void;
  onScroll: () => void;
  onLineContextMenu: (
    event: ReactMouseEvent<HTMLDivElement>,
    file: DiffFileSummary,
    line: DiffLine,
    selection?: DiffLineSelection,
  ) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [collapsedFileIds, setCollapsedFileIds] = useState<Set<string>>(new Set());
  const [copiedFileId, setCopiedFileId] = useState<string>();
  const copyResetTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (copyResetTimer.current !== undefined) {
        window.clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  const toggleFile = (fileId: string): void => {
    setCollapsedFileIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const copyPath = (file: DiffFileSummary): void => {
    void api
      .copyText(file.path)
      .then(() => {
        if (!mounted.current) return;
        setCopiedFileId(file.id);
        if (copyResetTimer.current !== undefined) {
          window.clearTimeout(copyResetTimer.current);
        }
        copyResetTimer.current = window.setTimeout(
          () => setCopiedFileId(undefined),
          1600,
        );
      })
      .catch((caught: unknown) => {
        if (mounted.current) onError(friendlyError(caught));
      });
  };

  const openFileInEditor = (file: DiffFileSummary, editor: EditorTool): void => {
    void api
      .openDiffFileInEditor({ sessionId: session.id, fileId: file.id, editor })
      .catch((caught: unknown) => {
        if (mounted.current) onError(friendlyError(caught));
      });
  };

  return (
    <div
      ref={scrollRoot}
      className={styles.diffPane}
      data-context-menu-open={contextLineId ? 'true' : undefined}
      onScroll={onScroll}
    >
      {files.length ? (
        files.map((file) => (
          <DiffFile
            key={file.id}
            file={file}
            patch={patches.get(file.id)}
            loading={loading.has(file.id)}
            error={fileErrors.get(file.id)}
            copied={copiedFileId === file.id}
            contextLineId={contextLineId}
            expanded={!collapsedFileIds.has(file.id)}
            editorAvailable={
              session.kind === 'branch' && session.sourceWorktreeId !== undefined
            }
            showEditorControls={session.kind === 'branch'}
            toolPreferences={toolPreferences}
            onSetToolPreference={onSetToolPreference}
            scrollRoot={scrollRoot}
            onVisible={onVisible}
            onCopy={() => copyPath(file)}
            onOpenInEditor={(editor) => openFileInEditor(file, editor)}
            onToggle={() => toggleFile(file.id)}
            onLineContextMenu={(event, line, selection) =>
              onLineContextMenu(event, file, line, selection)
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
  );
}
