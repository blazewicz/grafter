import { type RefObject, useEffect, useRef, useState } from 'react';

export function useNewWorktreeDialog(): {
  isOpen: boolean;
  addWorktreeButtonRef: RefObject<HTMLButtonElement | null>;
  openDialog: () => void;
  closeDialog: () => void;
} {
  const [isOpen, setIsOpen] = useState(false);
  const addWorktreeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== 'n' ||
        !event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat
      ) {
        return;
      }
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      setIsOpen(true);
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (wasOpen.current && !isOpen) addWorktreeButtonRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  const openDialog = (): void => setIsOpen(true);
  const closeDialog = (): void => setIsOpen(false);

  return { isOpen, addWorktreeButtonRef, openDialog, closeDialog };
}
