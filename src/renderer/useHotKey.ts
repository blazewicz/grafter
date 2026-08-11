import { useEffect, useEffectEvent } from 'react';

export function useHotKey(
  keyCombo: string,
  callback: (event: KeyboardEvent) => void,
): void {
  const onHotKey = useEffectEvent((event: KeyboardEvent) => callback(event));

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== keyCombo.toLowerCase() ||
        !event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
        return;
      }

      event.preventDefault();

      onHotKey(event);
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [keyCombo]);
}
