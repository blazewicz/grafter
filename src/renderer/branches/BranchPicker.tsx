import { Check, GitBranch, LoaderCircle, Minus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Worktree } from '../../shared/contracts';
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
  allowNone = false,
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
  allowNone?: boolean;
  onQueryChange?: () => void;
  onSelect: (branch: string) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [activeOption, setActiveOption] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return branches
      .filter((branch) => branch.toLocaleLowerCase().includes(needle))
      .slice(0, maximumVisibleBranches);
  }, [branches, query]);
  const available = useMemo(
    () =>
      filtered.filter(
        (branch) =>
          !disabledBranches.includes(branch) &&
          (!disableCheckedOut || checkedOutWorktree(worktrees, branch) === undefined),
      ),
    [disableCheckedOut, disabledBranches, filtered, worktrees],
  );
  const options = useMemo(
    () => (allowNone ? ['', ...available] : available),
    [allowNone, available],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const effectiveActiveOption =
    activeOption !== undefined &&
    (activeOption === '' || available.includes(activeOption))
      ? activeOption
      : options[0];

  const choose = (option: string): void => {
    if (option === '') {
      onSelect('');
      return;
    }
    if (
      disabledBranches.includes(option) ||
      (disableCheckedOut && checkedOutWorktree(worktrees, option))
    ) {
      return;
    }
    onSelect(option);
  };

  const moveActive = (offset: number): void => {
    if (!options.length) return;
    const currentIndex = effectiveActiveOption
      ? options.indexOf(effectiveActiveOption)
      : -1;
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + offset + options.length) % options.length;
    setActiveOption(options[nextIndex]);
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
            } else if (event.key === 'Enter' && effectiveActiveOption !== undefined) {
              event.preventDefault();
              choose(effectiveActiveOption);
            }
          }}
          placeholder="Filter branches…"
        />
      </div>
      <div className={styles.results}>
        {allowNone && (
          <button
            type="button"
            aria-label="(none)"
            className={
              selectedBranch === '' || effectiveActiveOption === '' ? styles.chosen : ''
            }
            onPointerMove={() => setActiveOption('')}
            onClick={() => choose('')}
          >
            <Minus size={12} />
            <span>(none)</span>
            {selectedBranch === '' && <Check size={12} />}
          </button>
        )}
        {filtered.map((branch) => {
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
                selectedBranch === branch || effectiveActiveOption === branch
                  ? styles.chosen
                  : ''
              }
              onPointerMove={() => {
                if (!disabledReason) setActiveOption(branch);
              }}
              onClick={() => choose(branch)}
            >
              <GitBranch size={12} />
              <span>{branch}</span>
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
