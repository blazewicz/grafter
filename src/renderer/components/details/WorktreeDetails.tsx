import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
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
import { api, friendlyError } from '../../grafter-api';
import { VisualStudioCodeMark } from '../ui/BrandMarks';
import { WorktreeSummary } from './WorktreeSummary';

const editorOptions: readonly {
  id: EditorTool;
  label: string;
}[] = [{ id: 'vscode', label: 'Visual Studio Code' }];

export function WorktreeDetails({
  details,
  projectWorktrees,
  status,
  onError,
}: {
  details: WorktreeDetailsData;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [editor, setEditor] = useState<EditorTool>('vscode');
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const editorMenuRef = useRef<HTMLDivElement>(null);
  const selectedEditorLabel =
    editorOptions.find((option) => option.id === editor)?.label ?? 'IDE';
  const pullRequest = details.pullRequest;

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

  const reportActionError = (action: Promise<void>): void => {
    void action.catch((caught: unknown) => onError(friendlyError(caught)));
  };

  const openInEditor = (nextEditor: EditorTool): void => {
    setEditor(nextEditor);
    setEditorMenuOpen(false);
    reportActionError(api.openWorktreeInEditor(details.id, nextEditor));
  };

  return (
    <div className="details-wrap">
      <div className="details-eyebrow">
        <FolderGit2 size={14} /> {details.projectName}
      </div>
      <div className="details-title-row">
        <div>
          <h1>{details.branch}</h1>
          <p>{details.isMain ? 'Main working tree' : 'Linked worktree'}</p>
        </div>
        <span
          className={`clean-badge ${status ?? 'checking'}`}
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
      <section className="path-card">
        <div className="path-copy">
          <span className="section-label">LOCAL PATH</span>
          <code>{details.path}</code>
        </div>
        <div className="path-actions">
          <button
            className="path-action-button"
            title="Open directory"
            aria-label="Open worktree directory"
            onClick={() => reportActionError(api.openWorktreeDirectory(details.id))}
          >
            <FolderOpen size={16} />
          </button>
          <div className="editor-picker" ref={editorMenuRef}>
            <div className="editor-split-button">
              <button
                className="editor-open-button"
                title={`Open in ${selectedEditorLabel}`}
                aria-label={`Open worktree in ${selectedEditorLabel}`}
                onClick={() => openInEditor(editor)}
              >
                <VisualStudioCodeMark />
              </button>
              <button
                className="editor-menu-button"
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
              <div className="editor-menu" role="menu">
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
      {details.branch === details.targetBranch ? (
        <WorktreeSummary worktrees={projectWorktrees} selectedId={details.id} />
      ) : (
        <>
          {pullRequest ? (
            <section className="pr-card">
              <div className="pr-icon">
                <GitPullRequest size={20} />
              </div>
              <div className="pr-content">
                <div className="pr-meta">
                  <span className="open-pill">{pullRequest.state}</span>
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
            <section className="quiet-card">
              <GitBranch size={17} />
              <div>
                <strong>No pull request found</strong>
                <span>Grafter checked this branch using the GitHub CLI.</span>
              </div>
            </section>
          )}
          <div className="section-heading">
            <div>
              <GitCompareArrows size={16} />
              <span>
                Changes against <strong>{details.targetBranch}</strong>
              </span>
            </div>
            <span className="commit-id">{details.head.slice(0, 8)}</span>
          </div>
          <section className="stats-grid">
            <div>
              <span>FILES CHANGED</span>
              <strong>{details.diff.files}</strong>
            </div>
            <div className="positive">
              <span>ADDITIONS</span>
              <strong>+{details.diff.additions}</strong>
            </div>
            <div className="negative">
              <span>DELETIONS</span>
              <strong>−{details.diff.deletions}</strong>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
