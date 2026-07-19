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
  AppSnapshot,
  EditorTool,
  Settings,
  Worktree,
  WorktreeDetails as WorktreeDetailsData,
  WorktreeStatus,
} from '../../../shared/contracts';
import { displayWorktreePath } from '../../../shared/path-display';
import { buildWorktreeList } from '../../../shared/worktree-list';
import { api, friendlyError } from '../../grafter-api';
import { BranchPicker } from '../branches/BranchPicker';
import { VisualStudioCodeMark } from '../ui/BrandMarks';
import styles from './details.module.css';
import { LatestCommitCard } from './LatestCommitCard';

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
  onError: (message: string) => void;
}): React.JSX.Element {
  const [editor, setEditor] = useState<EditorTool>('vscode');
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [copiedText, setCopiedText] = useState<string>();
  const editorMenuRef = useRef<HTMLDivElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const copyResetTimer = useRef<number | undefined>(undefined);
  const selectedEditorLabel =
    editorOptions.find((option) => option.id === editor)?.label ?? 'IDE';
  const pullRequest = details.pullRequest;
  const commit = details.commit;
  const worktreeDisplayName =
    buildWorktreeList(projectWorktrees).find(({ worktree }) => worktree.id === details.id)
      ?.displayName ?? (details.isMain ? 'main' : details.name);
  const mainClonePath =
    projectWorktrees.find((worktree) => worktree.isMain)?.path ?? details.path;
  const statusClass =
    status === 'dirty' ? styles.dirty : status === undefined ? styles.checking : '';
  const branchSwitchDisabledReason = switchingBranch
    ? 'Switching branches…'
    : status === 'dirty'
      ? 'Commit, stash, or discard your changes before switching branches'
      : status === undefined
        ? 'Checking for local changes'
        : undefined;

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

  useEffect(() => {
    if (!branchMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!branchMenuRef.current?.contains(event.target as Node)) {
        setBranchMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setBranchMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [branchMenuOpen]);

  useEffect(() => {
    if (!branchMenuOpen) return;
    let active = true;
    void api
      .listBranches(details.projectId)
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
  }, [branchMenuOpen, details.projectId, onError]);

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

  const toggleBranchMenu = (): void => {
    if (branchMenuOpen) {
      setBranchMenuOpen(false);
      return;
    }
    setBranches([]);
    setLoadingBranches(true);
    setBranchMenuOpen(true);
  };

  const switchBranch = async (branch: string): Promise<void> => {
    setSwitchingBranch(true);
    try {
      const snapshot = await api.switchBranch({
        worktreeId: details.id,
        branch,
      });
      setBranchMenuOpen(false);
      onSnapshot(snapshot);
    } catch (caught) {
      onError(friendlyError(caught));
    } finally {
      setSwitchingBranch(false);
    }
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
        <FolderGit2 size={14} /> {details.projectName}
      </button>
      <div className={styles.detailsTitleRow}>
        <div>
          <h1>{worktreeDisplayName}</h1>
          <div className={styles.checkedOutBranch}>
            <span>Checked-out branch:</span>
            <div className={styles.branchPicker} ref={branchMenuRef}>
              <span className={styles.branchPickerTrigger}>
                <button
                  className={styles.branchMenuButton}
                  aria-disabled={branchSwitchDisabledReason !== undefined}
                  aria-label={
                    branchSwitchDisabledReason
                      ? `Switch branch unavailable: ${branchSwitchDisabledReason}`
                      : 'Switch checked-out branch'
                  }
                  aria-haspopup="dialog"
                  aria-expanded={branchMenuOpen && !branchSwitchDisabledReason}
                  onClick={
                    branchSwitchDisabledReason === undefined
                      ? toggleBranchMenu
                      : undefined
                  }
                >
                  <code>{details.branch}</code>
                  <ChevronDown size={13} />
                </button>
                {!branchMenuOpen && (
                  <span className={styles.branchPickerTooltip} role="tooltip">
                    {branchSwitchDisabledReason ?? 'Switch branch'}
                  </span>
                )}
              </span>
              {branchMenuOpen && !branchSwitchDisabledReason && (
                <div
                  className={styles.branchMenu}
                  role="dialog"
                  aria-label="Switch checked-out branch"
                >
                  <BranchPicker
                    branches={branches}
                    worktrees={projectWorktrees}
                    currentWorktreeId={details.id}
                    loading={loadingBranches}
                    onSelect={(branch) => void switchBranch(branch)}
                  />
                </div>
              )}
            </div>
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
      {commit && (
        <LatestCommitCard
          key={commit.hash}
          commit={commit}
          settings={settings}
          systemLocale={systemLocale}
          copied={copiedText === commit.hash}
          onCopy={() => copyText(commit.hash)}
        />
      )}
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
