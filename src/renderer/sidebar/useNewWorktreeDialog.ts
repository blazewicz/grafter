import { type RefObject, useEffect, useRef, useState } from 'react';

export function useNewWorktreeDialog(): {
  adding: boolean;
  addWorktreeButtonRef: RefObject<HTMLButtonElement | null>;
  openNewWorktree: () => void;
  closeNewWorktree: () => void;
} {
  const [adding, setAdding] = useState(false);
  const addWorktreeButtonRef = useRef<HTMLButtonElement>(null);
  const wasAdding = useRef(false);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (
        event.key.toLocaleLowerCase() !== 'n' ||
        !event.metaKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      if (adding) return;
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
        return;
      }
      setAdding(true);
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [adding]);

  useEffect(() => {
    if (wasAdding.current && !adding) addWorktreeButtonRef.current?.focus();
    wasAdding.current = adding;
  }, [adding]);

  const openNewWorktree = (): void => setAdding(true);
  const closeNewWorktree = (): void => setAdding(false);

  return {
    adding,
    addWorktreeButtonRef,
    openNewWorktree,
    closeNewWorktree,
  };
}
