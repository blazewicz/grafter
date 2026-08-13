import { type RefObject, useEffect, useRef, useState } from 'react';
import { useDismissOutside } from '../ui/useDismissOutside';

export function useWorktreeFilter(): {
  filterOpen: boolean;
  worktreeFilter: string;
  filterInputRef: RefObject<HTMLInputElement | null>;
  filterToggleRef: RefObject<HTMLButtonElement | null>;
  setWorktreeFilter: (filter: string) => void;
  openWorktreeFilter: () => void;
  closeWorktreeFilter: () => void;
} {
  const [worktreeFilter, setWorktreeFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const filterToggleRef = useRef<HTMLButtonElement>(null);

  const focusFilterInput = () => {
    filterInputRef.current?.focus();
    filterInputRef.current?.select();
  };

  useEffect(() => {
    if (filterOpen) focusFilterInput();
  }, [filterOpen]);

  useEffect(() => {
    const focusWorktreeFilter = (event: KeyboardEvent): void => {
      if (
        event.key.toLocaleLowerCase() !== 'f' ||
        !event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      ) {
        return;
      }

      event.preventDefault();
      if (filterOpen) focusFilterInput();
      else setFilterOpen(true);
    };

    document.addEventListener('keydown', focusWorktreeFilter);
    return () => document.removeEventListener('keydown', focusWorktreeFilter);
  }, [filterOpen]);

  useDismissOutside({
    open: filterOpen,
    onClose: () => {
      if (worktreeFilter) return;
      setFilterOpen(false);
    },
    refs: [filterInputRef, filterToggleRef],
    closeOnEscape: false,
  });

  const openWorktreeFilter = () => setFilterOpen(true);
  const closeWorktreeFilter = () => {
    setFilterOpen(false);
    setWorktreeFilter('');
  };

  return {
    filterOpen,
    worktreeFilter,
    filterInputRef,
    filterToggleRef,
    setWorktreeFilter,
    openWorktreeFilter,
    closeWorktreeFilter,
  };
}
