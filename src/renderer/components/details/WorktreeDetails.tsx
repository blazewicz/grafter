import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
  Copy,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCompareArrows,
  GitPullRequest,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  EditorTool,
  Worktree,
  WorktreeDetails as WorktreeDetailsData,
  WorktreeStatus,
} from '../../../shared/contracts';
import { displayWorktreePath } from '../../../shared/path-display';
import { buildWorktreeList } from '../../../shared/worktree-list';
import { api, friendlyError } from '../../grafter-api';
import { VisualStudioCodeMark } from '../ui/BrandMarks';
import styles from './details.module.css';

const editorOptions: readonly {
  id: EditorTool;
  label: string;
}[] = [{ id: 'vscode', label: 'Visual Studio Code' }];

export function WorktreeDetails({
  homeDirectory,
  details,
  projectWorktrees,
  status,
  onError,
}: {
  homeDirectory: string;
  details: WorktreeDetailsData;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [editor, setEditor] = useState<EditorTool>('vscode');
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [copiedText, setCopiedText] = useState<string>();
  const editorMenuRef = useRef<HTMLDivElement>(null);
  const copyResetTimer = useRef<number | undefined>(undefined);
  const selectedEditorLabel =
    editorOptions.find((option) => option.id === editor)?.label ?? 'IDE';
  const pullRequest = details.pullRequest;
  const worktreeDisplayName =
    buildWorktreeList(projectWorktrees).find(({ worktree }) => worktree.id === details.id)
      ?.displayName ?? (details.isMain ? 'main' : details.name);
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
      <div className={styles.detailsEyebrow}>
        <FolderGit2 size={14} /> {details.projectName}
      </div>
      <div className={styles.detailsTitleRow}>
        <div>
          <h1>{worktreeDisplayName}</h1>
          <div className={styles.checkedOutBranch}>
            <span>Checked-out branch:</span>
            <code>{details.branch}</code>
            <button
              className={styles.copyTextButton}
              aria-label={
                copiedText === details.branch
                  ? 'Branch name copied'
                  : `Copy ${details.branch} branch name`
              }
              title={
                copiedText === details.branch ? 'Branch name copied' : 'Copy branch name'
              }
              onClick={() => copyText(details.branch)}
            >
              {copiedText === details.branch ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
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
            <button
              className={styles.copyTextButton}
              aria-label={
                copiedText === details.path
                  ? 'Worktree path copied'
                  : 'Copy worktree path'
              }
              title={
                copiedText === details.path
                  ? 'Worktree path copied'
                  : 'Copy worktree path'
              }
              onClick={() => copyText(details.path)}
            >
              {copiedText === details.path ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>
        <div className={styles.pathActions}>
          <button
            className={styles.pathActionButton}
            title="Open directory"
            aria-label="Open worktree directory"
            onClick={() => reportActionError(api.openWorktreeDirectory(details.id))}
          >
            <FolderOpen size={16} />
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
      {pullRequest ? (
        <section className={styles.prCard}>
          <div className={styles.prIcon}>
            <GitPullRequest size={20} />
          </div>
          <div className={styles.prContent}>
            <div className={styles.prMeta}>
              <span className={styles.prPill} data-state={pullRequest.state}>
                {pullRequest.state}
              </span>
              <span>Pull request #{pullRequest.number}</span>
            </div>
            <strong>{pullRequest.title}</strong>
            <span>Base branch: {pullRequest.baseBranch}</span>
          </div>
          <button
            aria-label="Open pull request"
            onClick={() => void api.openExternal(pullRequest.url)}
          >
            <ArrowUpRight size={17} />
          </button>
        </section>
      ) : (
        <section className={styles.quietCard}>
          <GitBranch size={17} />
          <div>
            <strong>No pull request found</strong>
            <span>Grafter checked this branch using the GitHub CLI.</span>
          </div>
        </section>
      )}
      {details.targetBranch && details.diff && (
        <>
          <div className={styles.sectionHeading}>
            <div>
              <GitCompareArrows size={16} />
              <span>
                Changes against <strong>{details.targetBranch}</strong>
              </span>
            </div>
            <span className={styles.commitId}>{details.head.slice(0, 8)}</span>
          </div>
          <section className={styles.statsGrid}>
            <div>
              <span>FILES CHANGED</span>
              <strong>{details.diff.files}</strong>
            </div>
            <div className={styles.positive}>
              <span>ADDITIONS</span>
              <strong>+{details.diff.additions}</strong>
            </div>
            <div className={styles.negative}>
              <span>DELETIONS</span>
              <strong>−{details.diff.deletions}</strong>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
