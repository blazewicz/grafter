import { Check, ChevronDown, FileDiff, GitBranch, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AppSnapshot,
  Worktree,
  WorktreeComparison,
  WorktreeDetails,
  WorktreeStatus,
} from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';
import { BranchPicker } from '../branches/BranchPicker';
import { CopyButton } from '../ui/CopyButton';
import styles from './details.module.css';
import { PullRequestCard } from './PullRequestCard';

interface LocalComparison extends WorktreeComparison {
  worktreeId: string;
  head: string;
}

export function BranchCard({
  details,
  projectWorktrees,
  status,
  copiedText,
  diffOpening,
  onSnapshot,
  onCopy,
  onOpenDiff,
  onError,
}: {
  details: WorktreeDetails;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  copiedText: string | undefined;
  diffOpening: boolean;
  onSnapshot: (snapshot: AppSnapshot) => void;
  onCopy: (text: string) => void;
  onOpenDiff?: () => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [openMenu, setOpenMenu] = useState<'branch' | 'comparison'>();
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [updatingComparison, setUpdatingComparison] = useState(false);
  const [localComparison, setLocalComparison] = useState<LocalComparison>();
  const branchPickerRef = useRef<HTMLDivElement>(null);
  const comparisonPickerRef = useRef<HTMLDivElement>(null);
  const pullRequest = details.pullRequest;
  const [pullRequestMissingOnMount] = useState(pullRequest === undefined);
  const animatePullRequestDiscovery =
    pullRequestMissingOnMount && pullRequest !== undefined;
  const comparison =
    localComparison?.worktreeId === details.id && localComparison.head === details.head
      ? localComparison
      : details;
  const automaticBaseBranch = comparison.automaticBaseBranch;
  const targetBranch = comparison.targetBranch;
  const comparisonBaseOverride = comparison.comparisonBaseOverride;
  const automaticBaseBranchUnavailable = comparison.automaticBaseBranchUnavailable;
  const comparisonBaseOverrideUnavailable = comparison.comparisonBaseOverrideUnavailable;
  const diffStats = comparison.diffStats;
  const branchSwitchDisabledReason = switchingBranch
    ? 'Switching branches…'
    : status === 'dirty'
      ? 'Commit, stash, or discard your changes before switching branches'
      : status === undefined
        ? 'Checking for local changes'
        : undefined;

  useEffect(() => {
    if (!openMenu) return;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      const picker =
        openMenu === 'branch' ? branchPickerRef.current : comparisonPickerRef.current;
      if (!picker?.contains(event.target as Node)) setOpenMenu(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenu(undefined);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
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
  }, [details.projectId, onError, openMenu]);

  const toggleMenu = (menu: 'branch' | 'comparison'): void => {
    if (openMenu === menu) {
      setOpenMenu(undefined);
      return;
    }
    setBranches([]);
    setLoadingBranches(true);
    setOpenMenu(menu);
  };

  const switchBranch = async (branch: string): Promise<void> => {
    setSwitchingBranch(true);
    try {
      const snapshot = await api.switchBranch({ worktreeId: details.id, branch });
      setOpenMenu(undefined);
      onSnapshot(snapshot);
    } catch (caught) {
      onError(friendlyError(caught));
    } finally {
      setSwitchingBranch(false);
    }
  };

  const setComparisonBase = async (target?: string): Promise<void> => {
    setUpdatingComparison(true);
    try {
      const next = await api.setComparisonBase({
        worktreeId: details.id,
        ...(target ? { targetBranch: target } : {}),
      });
      setLocalComparison({
        worktreeId: details.id,
        head: details.head,
        ...next,
      });
      setOpenMenu(undefined);
    } catch (caught) {
      onError(friendlyError(caught));
    } finally {
      setUpdatingComparison(false);
    }
  };

  const automaticSource = pullRequest ? 'Pull request base' : 'Repository default';

  return (
    <section className={styles.branchCard} aria-label="Checked-out branch">
      <div className={styles.branchSection}>
        <span className={styles.sectionLabel}>CHECKED-OUT BRANCH</span>
        <div className={styles.branchTitleRow}>
          <GitBranch className={styles.branchTitleIcon} size={16} aria-hidden="true" />
          <div className={styles.branchPicker} ref={branchPickerRef}>
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
                aria-expanded={openMenu === 'branch' && !branchSwitchDisabledReason}
                onClick={
                  branchSwitchDisabledReason === undefined
                    ? () => toggleMenu('branch')
                    : undefined
                }
              >
                <code>{details.branch}</code>
                <ChevronDown size={13} />
              </button>
              {openMenu !== 'branch' && (
                <span className={styles.branchPickerTooltip} role="tooltip">
                  {branchSwitchDisabledReason ?? 'Switch branch'}
                </span>
              )}
            </span>
            {openMenu === 'branch' && !branchSwitchDisabledReason && (
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
          <CopyButton
            copied={copiedText === details.branch}
            copyLabel={`Copy ${details.branch} branch name`}
            copiedLabel="Branch name copied"
            onCopy={() => onCopy(details.branch)}
            className={styles.branchCopyButton}
          />
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
        </div>

        <div className={styles.comparisonRow}>
          <span>Compared with</span>
          <div className={styles.comparisonPicker} ref={comparisonPickerRef}>
            <button
              className={styles.comparisonMenuButton}
              aria-label="Choose comparison base"
              aria-haspopup="dialog"
              aria-expanded={openMenu === 'comparison'}
              disabled={updatingComparison}
              onClick={() => toggleMenu('comparison')}
            >
              <code>{targetBranch ?? 'Choose a branch'}</code>
              <ChevronDown size={13} />
            </button>
            {openMenu === 'comparison' && (
              <div
                className={styles.comparisonMenu}
                role="dialog"
                aria-label="Choose comparison base"
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
          {updatingComparison ? (
            <span className={styles.comparisonLoading}>
              <LoaderCircle className="spin" size={12} /> Updating…
            </span>
          ) : (
            diffStats && (
              <div
                className={styles.comparisonStats}
                aria-label="Branch comparison stats"
              >
                <span aria-hidden="true">·</span>
                <span>
                  {diffStats.files} {diffStats.files === 1 ? 'file' : 'files'}
                </span>
                <span aria-hidden="true">·</span>
                <strong
                  className={styles.positive}
                  aria-label={`${diffStats.additions} additions`}
                >
                  +{diffStats.additions}
                </strong>
                <strong
                  className={styles.negative}
                  aria-label={`${diffStats.deletions} deletions`}
                >
                  −{diffStats.deletions}
                </strong>
              </div>
            )
          )}
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
      </div>

      {pullRequest && (
        <PullRequestCard
          pullRequest={pullRequest}
          animatePullRequestDiscovery={animatePullRequestDiscovery}
          onError={onError}
        />
      )}
    </section>
  );
}
