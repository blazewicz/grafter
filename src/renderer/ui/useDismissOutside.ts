import { useEffect, useEffectEvent } from 'react';
import type { RefObject } from 'react';

/**
 * Closes a popover on outside `pointerdown`, on `Escape`, and optionally on
 * window blur.
 *
 * Escape contract: closes the popover and prevents default; it does not stop
 * propagation, so callers must disable `closeOnEscape` (and handle Escape
 * themselves) when a parent dialog needs Escape precedence — see
 * `NewWorktreeDialog`, where Escape closes the dialog unless a branch is
 * chosen.
 */
export function useDismissOutside({
  open,
  onClose,
  refs,
  closeOnBlur = false,
  closeOnEscape = true,
}: {
  open: boolean;
  onClose: () => void;
  refs: readonly RefObject<HTMLElement | null>[];
  closeOnBlur?: boolean;
  closeOnEscape?: boolean;
}): void {
  const onCloseEvent = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent): void => {
      if (!refs.some((ref) => ref.current?.contains(event.target as Node))) {
        onCloseEvent();
      }
    };
    const closeOnEscapeKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseEvent();
    };
    const closeOnWindowBlur = (): void => onCloseEvent();

    document.addEventListener('pointerdown', closeOnPointerDown);
    if (closeOnEscape) document.addEventListener('keydown', closeOnEscapeKey);
    if (closeOnBlur) window.addEventListener('blur', closeOnWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      if (closeOnEscape) document.removeEventListener('keydown', closeOnEscapeKey);
      if (closeOnBlur) window.removeEventListener('blur', closeOnWindowBlur);
    };
  }, [closeOnBlur, closeOnEscape, open, refs]);
}
