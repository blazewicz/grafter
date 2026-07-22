import { Check, ChevronDown, Circle, FolderOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AppSnapshot,
  EditorTool,
  Settings,
  Worktree,
  WorktreeDetails as WorktreeDetailsData,
  WorktreeStatus,
} from '../../../shared/contracts';
import { displayWorktreePath } from '../../../shared/path-display';
import { api, friendlyError } from '../../grafter-api';
import { FinderMark, VisualStudioCodeMark } from '../ui/BrandMarks';
import { CopyButton } from '../ui/CopyButton';
import styles from './details.module.css';
import { BranchCard } from './BranchCard';
import { LatestCommitCard } from './LatestCommitCard';

export { openPullRequestLink } from './BranchCard';

const editorOptions: readonly {
  id: EditorTool;
  label: string;
}[] = [{ id: 'vscode', label: 'Visual Studio Code' }];

export function WorktreeDetails({
  homeDirectory,
  settings,
  systemLocale,
  details,
  projectWorktrees,
  status,
  onSnapshot,
  onSelectProject,
  diffOpening = false,
  onOpenDiff,
  onOpenCommitDiff,
  onError,
}: {
  homeDirectory: string;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  details: WorktreeDetailsData;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  onSnapshot: (snapshot: AppSnapshot) => void;
  onSelectProject: (projectId: string) => void;
  diffOpening?: boolean;
  onOpenDiff?: () => void;
  onOpenCommitDiff?: (commitHash: string) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [editor, setEditor] = useState<EditorTool>('vscode');
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [copiedText, setCopiedText] = useState<string>();
  const editorMenuRef = useRef<HTMLDivElement>(null);
  const copyResetTimer = useRef<number | undefined>(undefined);
  const selectedEditorLabel =
    editorOptions.find((option) => option.id === editor)?.label ?? 'IDE';
  const commit = details.commit;
  const mainClonePath =
    projectWorktrees.find((worktree) => worktree.isMain)?.path ?? details.path;
  const statusClass =
    status === 'dirty' ? styles.dirty : status === undefined ? styles.checking : '';

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

  useEffect(
    () => () => {
      if (copyResetTimer.current !== undefined) {
        window.clearTimeout(copyResetTimer.current);
      }
    },
    [],
  );

  const reportActionError = (action: Promise<void>): void => {
    void action.catch((caught: unknown) => onError(friendlyError(caught)));
  };

  const openInEditor = (nextEditor: EditorTool): void => {
    setEditor(nextEditor);
    setEditorMenuOpen(false);
    reportActionError(api.openWorktreeInEditor(details.id, nextEditor));
  };

  const copyText = (text: string): void => {
    void api
      .copyText(text)
      .then(() => {
        setCopiedText(text);
        if (copyResetTimer.current !== undefined) {
          window.clearTimeout(copyResetTimer.current);
        }
        copyResetTimer.current = window.setTimeout(() => setCopiedText(undefined), 1600);
      })
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  return (
    <div className={styles.detailsWrap}>
      <button
        className={`${styles.detailsEyebrow} ${styles.detailsProjectLink}`}
        aria-label={`Open ${details.projectName} project details`}
        title="Open project details"
        onClick={() => onSelectProject(details.projectId)}
      >
        <FolderOpen size={14} /> {details.projectName}
      </button>
      <div className={styles.detailsTitleRow}>
        <div>
          <h1>{details.displayName}</h1>
        </div>
        <span
          className={`${styles.cleanBadge} ${statusClass}`}
          aria-live="polite"
          title={
            status === 'clean'
              ? 'No local changes'
              : status === 'dirty'
                ? 'Uncommitted local changes are present'
                : 'Checking for local changes'
          }
        >
          <Circle size={7} fill="currentColor" /> {status ?? 'checking'}
        </span>
      </div>
      <section className={styles.pathCard}>
        <div className={styles.pathCopy}>
          <span className={styles.sectionLabel}>WORKTREE PATH</span>
          <div className={styles.pathValue}>
            <code>{displayWorktreePath(details.path, mainClonePath, homeDirectory)}</code>
            <CopyButton
              copied={copiedText === details.path}
              copyLabel="Copy worktree path"
              copiedLabel="Worktree path copied"
              onCopy={() => copyText(details.path)}
              className={styles.pathCopyButton}
            />
          </div>
        </div>
        <div className={styles.pathActions}>
          <button
            className={styles.sectionActionButton}
            title="Open directory"
            aria-label="Open worktree directory"
            onClick={() => reportActionError(api.openWorktreeDirectory(details.id))}
          >
            <FinderMark />
          </button>
          <div className={styles.editorPicker} ref={editorMenuRef}>
            <div className={styles.editorSplitButton}>
              <button
                className={styles.editorOpenButton}
                title={`Open in ${selectedEditorLabel}`}
                aria-label={`Open worktree in ${selectedEditorLabel}`}
                onClick={() => openInEditor(editor)}
              >
                <VisualStudioCodeMark />
              </button>
              <button
                className={styles.editorMenuButton}
                title="Choose IDE"
                aria-label="Choose IDE"
                aria-haspopup="menu"
                aria-expanded={editorMenuOpen}
                onClick={() => setEditorMenuOpen((open) => !open)}
              >
                <ChevronDown size={13} />
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
      </section>
      <BranchCard
        details={details}
        projectWorktrees={projectWorktrees}
        status={status}
        copiedText={copiedText}
        diffOpening={diffOpening}
        onSnapshot={onSnapshot}
        onCopy={copyText}
        {...(onOpenDiff ? { onOpenDiff } : {})}
        onError={onError}
      />
      {commit && (
        <LatestCommitCard
          key={commit.hash}
          commit={commit}
          settings={settings}
          systemLocale={systemLocale}
          copied={copiedText === commit.hash}
          onCopy={() => copyText(commit.hash)}
          opening={diffOpening}
          {...(onOpenCommitDiff
            ? { onViewChanges: () => onOpenCommitDiff(commit.hash) }
            : {})}
        />
      )}
    </div>
  );
}
