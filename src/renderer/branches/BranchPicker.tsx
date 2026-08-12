import fuzzysort from 'fuzzysort';
import { Check, GitBranch, LoaderCircle, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Worktree } from '../../shared/contracts';
import { HighlightedText } from '../ui/HighlightedText';
import styles from './BranchPicker.module.css';

const maximumVisibleBranches = 7;

export function BranchPicker({
  branches,
  worktrees = [],
  currentWorktreeId,
  selectedBranch,
  disableCheckedOut = true,
  disabledBranches = [],
  loading = false,
  onQueryChange,
  onSelect,
}: {
  branches: readonly string[];
  worktrees?: readonly Worktree[];
  currentWorktreeId?: string;
  selectedBranch?: string;
  disableCheckedOut?: boolean;
  disabledBranches?: readonly string[];
  loading?: boolean;
  onQueryChange?: () => void;
  onSelect: (branch: string) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [activeBranch, setActiveBranch] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return fuzzysort
      .go(needle, branches, { limit: maximumVisibleBranches, threshold: 0 })
      .map((result) => ({ branch: result.target, indexes: result.indexes }));
  }, [branches, query]);
  const available = useMemo(
    () =>
      filtered.filter(
        ({ branch }) =>
          !disabledBranches.includes(branch) &&
          (!disableCheckedOut || checkedOutWorktree(worktrees, branch) === undefined),
      ),
    [disableCheckedOut, disabledBranches, filtered, worktrees],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const effectiveActiveBranch =
    activeBranch && available.some(({ branch }) => branch === activeBranch)
      ? activeBranch
      : available[0]?.branch;

  const choose = (branch: string): void => {
    if (
      disabledBranches.includes(branch) ||
      (disableCheckedOut && checkedOutWorktree(worktrees, branch))
    ) {
      return;
    }
    onSelect(branch);
  };

  const moveActive = (offset: number): void => {
    if (!available.length) return;
    const currentIndex = effectiveActiveBranch
      ? available.findIndex(({ branch }) => branch === effectiveActiveBranch)
      : -1;
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + offset + available.length) % available.length;
    const nextBranch = available[nextIndex]?.branch;
    if (nextBranch) setActiveBranch(nextBranch);
  };

  return (
    <div className={styles.picker}>
      <div className={styles.inputWithIcon}>
        <Search size={13} />
        <input
          ref={inputRef}
          value={query}
          aria-label="Filter branches"
          onChange={(event) => {
            setQuery(event.target.value);
            onQueryChange?.();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveActive(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveActive(-1);
            } else if (event.key === 'Enter' && effectiveActiveBranch) {
              event.preventDefault();
              choose(effectiveActiveBranch);
            }
          }}
          placeholder="Filter branches…"
        />
      </div>
      <div className={styles.results}>
        {filtered.map(({ branch, indexes }) => {
          const checkedOut = checkedOutWorktree(worktrees, branch);
          const disabledReason = disabledBranches.includes(branch)
            ? 'Already selected for comparison'
            : disableCheckedOut && checkedOut
              ? checkedOut.id === currentWorktreeId
                ? 'Currently checked out in this worktree'
                : `Already checked out in ${checkedOut.displayName}`
              : undefined;
          return (
            <button
              key={branch}
              type="button"
              disabled={disabledReason !== undefined}
              title={disabledReason}
              aria-label={disabledReason ? `${branch}: ${disabledReason}` : branch}
              className={
                selectedBranch === branch || effectiveActiveBranch === branch
                  ? styles.chosen
                  : ''
              }
              onPointerMove={() => {
                if (!disabledReason) setActiveBranch(branch);
              }}
              onClick={() => choose(branch)}
            >
              <GitBranch size={12} />
              <span>
                <HighlightedText text={branch} indexes={indexes} />
              </span>
              {selectedBranch === branch && <Check size={12} />}
            </button>
          );
        })}
        {loading && !branches.length ? (
          <div className={styles.message}>
            <LoaderCircle className="spin" size={12} /> Loading branches…
          </div>
        ) : (
          !filtered.length && <div className={styles.message}>No matching branches</div>
        )}
      </div>
    </div>
  );
}

function checkedOutWorktree(
  worktrees: readonly Worktree[],
  branch: string,
): Worktree | undefined {
  return worktrees.find((worktree) => worktree.branch === branch);
}
