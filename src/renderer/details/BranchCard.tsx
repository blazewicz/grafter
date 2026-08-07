import { ChevronDown, GitBranch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AppSnapshot,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../../shared/contracts';
import { api, friendlyError } from '../grafter-api';
import { BranchPicker } from '../branches/BranchPicker';
import { CopyButton } from '../ui/CopyButton';
import styles from './details.module.css';
import { PullRequestCard } from './PullRequestCard';

export function BranchCard({
  details,
  projectWorktrees,
  status,
  copiedText,
  onSnapshot,
  onCopy,
  onError,
}: {
  details: WorktreeDetails;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  copiedText: string | undefined;
  onSnapshot: (snapshot: AppSnapshot) => void;
  onCopy: (text: string) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const branchPickerRef = useRef<HTMLDivElement>(null);
  const pullRequest = details.pullRequest;
  const [pullRequestMissingOnMount] = useState(pullRequest === undefined);
  const animatePullRequestDiscovery =
    pullRequestMissingOnMount && pullRequest !== undefined;
  const branchSwitchDisabledReason = switchingBranch
    ? 'Switching branches…'
    : status === 'dirty'
      ? 'Commit, stash, or discard your changes before switching branches'
      : status === undefined
        ? 'Checking for local changes'
        : undefined;

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!branchPickerRef.current?.contains(event.target as Node)) setMenuOpen(false);
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
      .listBranches()
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
  }, [menuOpen, onError]);

  const switchBranch = async (branch: string): Promise<void> => {
    setSwitchingBranch(true);
    try {
      const snapshot = await api.switchBranch({ worktreeId: details.id, branch });
      setMenuOpen(false);
      onSnapshot(snapshot);
    } catch (caught) {
      onError(friendlyError(caught));
    } finally {
      setSwitchingBranch(false);
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
    <section
      className={`${styles.branchCard} ${
        menuOpen && !branchSwitchDisabledReason ? styles.branchCardMenuOpen : ''
      }`}
      aria-label="Checked-out branch"
    >
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
                aria-expanded={menuOpen && !branchSwitchDisabledReason}
                onClick={
                  branchSwitchDisabledReason === undefined ? toggleMenu : undefined
                }
              >
                <code>{details.branch}</code>
                <ChevronDown size={13} />
              </button>
              {!menuOpen && (
                <span className={styles.branchPickerTooltip} role="tooltip">
                  {branchSwitchDisabledReason ?? 'Switch branch'}
                </span>
              )}
            </span>
            {menuOpen && !branchSwitchDisabledReason && (
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
