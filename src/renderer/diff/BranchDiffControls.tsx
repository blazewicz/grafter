import {
  ArrowLeftRight,
  ChevronDown,
  GitCompareArrows,
  LoaderCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BranchDiffSession, DiffSession } from '../../shared/contracts';
import { api, friendlyError } from '../grafter-api';
import { BranchPicker } from '../branches/BranchPicker';
import styles from './DiffViewer.module.css';

export function BranchDiffControls({
  session,
  onSessionChange,
  onError,
}: {
  session: BranchDiffSession;
  onSessionChange: (session: DiffSession) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const controlsRef = useRef<HTMLDivElement>(null);
  const [branchMenu, setBranchMenu] = useState<'source' | 'target'>();
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (!branchMenu) return;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setBranchMenu(undefined);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [branchMenu]);

  useEffect(() => {
    if (!branchMenu || branches.length) return;
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
  }, [branchMenu, branches.length, onError]);

  const compareBranches = (sourceBranch: string, targetBranch: string): void => {
    setBranchMenu(undefined);
    if (
      comparing ||
      (sourceBranch === session.branch && targetBranch === session.targetBranch)
    ) {
      return;
    }
    setComparing(true);
    void api
      .openBranchDiff({
        sourceBranch,
        targetBranch,
      })
      .then(onSessionChange)
      .catch((caught: unknown) => onError(friendlyError(caught)))
      .finally(() => setComparing(false));
  };

  const toggleBranchMenu = (menu: 'source' | 'target'): void => {
    if (branchMenu !== menu && !branches.length) setLoadingBranches(true);
    setBranchMenu((current) => (current === menu ? undefined : menu));
  };

  return (
    <div className={styles.toolbarTitle}>
      <GitCompareArrows size={16} />
      <div>
        <strong>Comparing</strong>
        <div
          className={styles.branchControls}
          ref={controlsRef}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !branchMenu) return;
            event.preventDefault();
            event.stopPropagation();
            setBranchMenu(undefined);
          }}
        >
          <div className={styles.branchControl}>
            <button
              className={styles.branchButton}
              aria-label="Choose source branch"
              aria-haspopup="dialog"
              aria-expanded={branchMenu === 'source'}
              disabled={comparing}
              onClick={() => toggleBranchMenu('source')}
            >
              <code>{session.branch}</code>
              <ChevronDown size={11} />
            </button>
            {branchMenu === 'source' && (
              <div
                className={styles.branchMenu}
                role="dialog"
                aria-label="Choose source branch"
              >
                <BranchPicker
                  branches={branches}
                  selectedBranch={session.branch}
                  disabledBranches={[session.targetBranch]}
                  disableCheckedOut={false}
                  loading={loadingBranches}
                  onSelect={(branch) => compareBranches(branch, session.targetBranch)}
                />
              </div>
            )}
          </div>
          <button
            className={styles.swapBranchesButton}
            aria-label="Swap source and destination branches"
            title="Swap branches"
            disabled={comparing}
            onClick={() => compareBranches(session.targetBranch, session.branch)}
          >
            {comparing ? (
              <LoaderCircle className="spin" size={11} />
            ) : (
              <ArrowLeftRight size={11} />
            )}
          </button>
          <div className={styles.branchControl}>
            <button
              className={styles.branchButton}
              aria-label="Choose destination branch"
              aria-haspopup="dialog"
              aria-expanded={branchMenu === 'target'}
              disabled={comparing}
              onClick={() => toggleBranchMenu('target')}
            >
              <code>{session.targetBranch}</code>
              <ChevronDown size={11} />
            </button>
            {branchMenu === 'target' && (
              <div
                className={styles.branchMenu}
                role="dialog"
                aria-label="Choose destination branch"
              >
                <BranchPicker
                  branches={branches}
                  selectedBranch={session.targetBranch}
                  disabledBranches={[session.branch]}
                  disableCheckedOut={false}
                  loading={loadingBranches}
                  onSelect={(branch) => compareBranches(session.branch, branch)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
