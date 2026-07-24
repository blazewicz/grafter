import {
  Check,
  ChevronDown,
  FileDiff,
  GitCompareArrows,
  LoaderCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  Settings,
  Worktree,
  WorktreeComparison,
  WorktreeDetails,
} from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';
import { BranchPicker } from '../branches/BranchPicker';
import { CopyButton } from '../ui/CopyButton';
import { CommitHistoryCard } from './CommitHistoryCard';
import styles from './details.module.css';

interface LocalComparison extends WorktreeComparison {
  worktreeId: string;
  branch: string;
  head: string;
  sourceAutomaticBaseBranch?: string;
  sourceAutomaticBaseBranchUnavailable?: boolean;
}

export function isLocalComparisonCurrent(
  comparison: LocalComparison | undefined,
  details: WorktreeDetails,
): comparison is LocalComparison {
  return (
    comparison?.worktreeId === details.id &&
    comparison.branch === details.branch &&
    comparison.head === details.head &&
    comparison.sourceAutomaticBaseBranch === details.automaticBaseBranch &&
    comparison.sourceAutomaticBaseBranchUnavailable ===
      details.automaticBaseBranchUnavailable
  );
}

export function BranchChangesCard({
  details,
  projectWorktrees,
  settings,
  systemLocale,
  copiedText,
  diffOpening,
  onCopy,
  onOpenDiff,
  onOpenCommitDiff,
  onError,
}: {
  details: WorktreeDetails;
  projectWorktrees: Worktree[];
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  copiedText: string | undefined;
  diffOpening: boolean;
  onCopy: (text: string) => void;
  onOpenDiff?: () => void;
  onOpenCommitDiff?: (commitHash: string) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [updatingComparison, setUpdatingComparison] = useState(false);
  const [localComparison, setLocalComparison] = useState<LocalComparison>();
  const comparisonPickerRef = useRef<HTMLDivElement>(null);
  const comparison = isLocalComparisonCurrent(localComparison, details)
    ? localComparison
    : details;
  const {
    automaticBaseBranch,
    automaticBaseBranchUnavailable,
    comparisonBaseOverride,
    comparisonBaseOverrideUnavailable,
    diffStats,
    targetBranch,
  } = comparison;
  const historyKey = targetBranch
    ? `${details.id}\0${details.branch}\0${details.head}\0${targetBranch}`
    : undefined;
  const automaticSource = details.pullRequest
    ? 'Pull request base'
    : 'Repository default';

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!comparisonPickerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
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
  }, [details.projectId, menuOpen, onError]);

  const setComparisonBase = async (target?: string): Promise<void> => {
    setUpdatingComparison(true);
    try {
      const next = await api.setComparisonBase({
        worktreeId: details.id,
        ...(target ? { targetBranch: target } : {}),
      });
      setLocalComparison({
        worktreeId: details.id,
        branch: details.branch,
        head: details.head,
        ...(details.automaticBaseBranch
          ? { sourceAutomaticBaseBranch: details.automaticBaseBranch }
          : {}),
        ...(details.automaticBaseBranchUnavailable
          ? { sourceAutomaticBaseBranchUnavailable: true }
          : {}),
        ...next,
      });
      setMenuOpen(false);
    } catch (caught) {
      onError(friendlyError(caught));
    } finally {
      setUpdatingComparison(false);
    }
  };

  const toggleMenu = (): void => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    setBranches([]);
    setLoadingBranches(true);
    setMenuOpen(true);
  };

  return (
    <section className={styles.branchChangesGroup} aria-label="Branch changes">
      <div className={styles.branchChangesCard}>
        <span className={styles.sectionLabel}>BRANCH CHANGES</span>
        <div className={styles.branchChangesRow}>
          <GitCompareArrows
            className={styles.branchChangesIcon}
            size={16}
            aria-hidden="true"
          />
          <span className={styles.branchChangesPrefix}>Changes into</span>
          <div className={styles.branchTargetGroup}>
            <div className={styles.comparisonPicker} ref={comparisonPickerRef}>
              <button
                className={styles.comparisonMenuButton}
                aria-label="Choose target branch"
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                disabled={updatingComparison}
                onClick={toggleMenu}
                title={targetBranch ?? 'Choose a branch'}
              >
                <code>{targetBranch ?? 'Choose a branch'}</code>
                <ChevronDown size={13} />
              </button>
              {menuOpen && (
                <div
                  className={styles.comparisonMenu}
                  role="dialog"
                  aria-label="Choose target branch"
                >
                  <button
                    className={styles.automaticBaseButton}
                    type="button"
                    onClick={() => void setComparisonBase()}
                  >
                    <span>
                      <strong>Automatic</strong>
                      <small>
                        {automaticBaseBranch ?? 'No default found'} · {automaticSource}
                      </small>
                    </span>
                    {!comparisonBaseOverride && <Check size={13} />}
                  </button>
                  <div className={styles.comparisonMenuDivider} />
                  <BranchPicker
                    branches={branches}
                    worktrees={projectWorktrees}
                    {...(comparisonBaseOverride
                      ? { selectedBranch: comparisonBaseOverride }
                      : {})}
                    disableCheckedOut={false}
                    disabledBranches={[details.branch]}
                    loading={loadingBranches}
                    onSelect={(branch) => void setComparisonBase(branch)}
                  />
                </div>
              )}
            </div>
            {targetBranch && (
              <CopyButton
                copied={copiedText === targetBranch}
                copyLabel={`Copy ${targetBranch} branch name`}
                copiedLabel="Branch name copied"
                onCopy={() => onCopy(targetBranch)}
                className={styles.branchTargetCopyButton}
              />
            )}
          </div>
          {targetBranch && diffStats && onOpenDiff && (
            <button
              className={styles.sectionActionButton}
              aria-label="View branch diff"
              title="View branch diff"
              disabled={diffOpening || updatingComparison}
              onClick={onOpenDiff}
            >
              {diffOpening ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <FileDiff size={14} />
              )}
            </button>
          )}
          {updatingComparison ? (
            <span className={styles.comparisonLoading}>
              <LoaderCircle className="spin" size={12} /> Updating…
            </span>
          ) : (
            diffStats && <ComparisonStats stats={diffStats} />
          )}
        </div>
        {automaticBaseBranchUnavailable && automaticBaseBranch && (
          <span className={styles.comparisonNotice} role="status">
            PR base <code>{automaticBaseBranch}</code> is not available locally
          </span>
        )}
        {comparisonBaseOverrideUnavailable && targetBranch && (
          <span className={styles.comparisonNotice} role="status">
            Comparison base <code>{targetBranch}</code> is not available locally. Choose
            another branch.
          </span>
        )}
      </div>

      {targetBranch && diffStats && (
        <CommitHistoryCard
          key={historyKey}
          worktreeId={details.id}
          targetBranch={targetBranch}
          settings={settings}
          systemLocale={systemLocale}
          copiedText={copiedText}
          opening={diffOpening}
          onCopy={onCopy}
          {...(onOpenCommitDiff ? { onViewChanges: onOpenCommitDiff } : {})}
          onError={onError}
        />
      )}
    </section>
  );
}

function ComparisonStats({
  stats,
}: {
  stats: NonNullable<WorktreeComparison['diffStats']>;
}): React.JSX.Element {
  return (
    <div className={styles.comparisonStats} aria-label="Branch comparison stats">
      <span>
        {stats.files} {stats.files === 1 ? 'file' : 'files'}
      </span>
      <span aria-hidden="true">·</span>
      <strong className={styles.positive} aria-label={`${stats.additions} additions`}>
        +{stats.additions}
      </strong>
      <strong className={styles.negative} aria-label={`${stats.deletions} deletions`}>
        −{stats.deletions}
      </strong>
    </div>
  );
}
