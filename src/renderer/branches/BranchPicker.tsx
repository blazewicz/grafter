import fuzzysort from 'fuzzysort';
import { Check, GitBranch, LoaderCircle, Search } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { Worktree } from '../../shared/contracts';
import { HighlightedText } from '../ui/HighlightedText';
import { menuKeyAction, nextWrapIndex } from '../ui/menu-navigation';
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
  const itemRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return fuzzysort
      .go(needle, branches, { limit: maximumVisibleBranches, threshold: 0 })
      .map(({ target, indexes }) => ({ branch: target, indexes }));
  }, [branches, query]);
  const displayed = useMemo(
    () =>
      filtered.map((base) => {
        const checkedOut = checkedOutWorktree(worktrees, base.branch);
        const disabledReason = disabledBranches.includes(base.branch)
          ? 'Already selected for comparison'
          : disableCheckedOut && checkedOut
            ? checkedOut.id === currentWorktreeId
              ? 'Currently checked out in this worktree'
              : `Already checked out in ${checkedOut.displayName}`
            : undefined;
        return { ...base, disabledReason };
      }),
    [disableCheckedOut, disabledBranches, currentWorktreeId, worktrees, filtered],
  );
  const available = useMemo(
    () => displayed.filter(({ disabledReason }) => disabledReason === undefined),
    [displayed],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const effectiveActiveBranch =
    activeBranch && available.some(({ branch }) => branch === activeBranch)
      ? activeBranch
      : available[0]?.branch;

  const activateFromKeyboard = (branch: string): void => {
    if (branch === effectiveActiveBranch) return;
    setActiveBranch(branch);
    itemRefs.current.get(branch)?.scrollIntoView({ block: 'nearest' });
  };

  const choose = (branch: string): void => {
    if (!available.find((next) => next.branch === branch)) return;
    onSelect(branch);
  };

  const moveActive = (offset: number): void => {
    if (!available.length) return;
    const currentIndex = effectiveActiveBranch
      ? available.findIndex(({ branch }) => branch === effectiveActiveBranch)
      : -1;
    const nextIndex = nextWrapIndex(currentIndex, offset, available.length);
    const nextBranch = available[nextIndex]?.branch;
    if (nextBranch) activateFromKeyboard(nextBranch);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const action = menuKeyAction(event.key);
    switch (action?.kind) {
      case 'move': {
        event.preventDefault();
        moveActive(action.offset);
        break;
      }
      case 'home': {
        event.preventDefault();
        const first = available[0];
        if (first) activateFromKeyboard(first.branch);
        break;
      }
      case 'end': {
        event.preventDefault();
        const last = available[available.length - 1];
        if (last) activateFromKeyboard(last.branch);
        break;
      }
      case 'select': {
        if (event.key === 'Enter' && effectiveActiveBranch) {
          event.preventDefault();
          choose(effectiveActiveBranch);
        }
        break;
      }
    }
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
          onKeyDown={handleKeyDown}
          placeholder="Filter branches…"
        />
      </div>
      <div className={styles.results}>
        {displayed.map(({ branch, indexes, disabledReason }) => (
          <BranchRow
            key={branch}
            branch={branch}
            indexes={indexes}
            selected={selectedBranch === branch}
            disabledReason={disabledReason}
            effectiveActiveBranch={effectiveActiveBranch}
            setActiveBranch={() => setActiveBranch(branch)}
            choose={() => choose(branch)}
            registerItemRef={(element) => itemRefs.current.set(branch, element)}
          />
        ))}
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

function BranchRow({
  branch,
  indexes,
  selected,
  disabledReason,
  effectiveActiveBranch,
  setActiveBranch,
  choose,
  registerItemRef,
}: {
  branch: string;
  indexes: readonly number[];
  selected: boolean;
  disabledReason: string | undefined;
  effectiveActiveBranch: string | undefined;
  setActiveBranch: () => void;
  choose: () => void;
  registerItemRef: (element: HTMLButtonElement | null) => void;
}): React.JSX.Element {
  return (
    <button
      ref={(element) => registerItemRef(element)}
      type="button"
      disabled={disabledReason !== undefined}
      title={disabledReason}
      aria-label={disabledReason ? `${branch}: ${disabledReason}` : branch}
      className={selected || effectiveActiveBranch === branch ? styles.chosen : ''}
      onPointerMove={() => {
        if (!disabledReason) setActiveBranch();
      }}
      onClick={choose}
    >
      <GitBranch size={12} />
      <span>
        <HighlightedText text={branch} indexes={indexes} />
      </span>
      {selected && <Check size={12} />}
    </button>
  );
}

function checkedOutWorktree(
  worktrees: readonly Worktree[],
  branch: string,
): Worktree | undefined {
  return worktrees.find((worktree) => worktree.branch === branch);
}
