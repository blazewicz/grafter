import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPosition } from './useAnchoredPosition';
import styles from './QuickTooltip.module.css';

export function QuickTooltip({
  label,
  showDelay = 300,
  align = 'left',
  className,
  children,
}: {
  label?: string | undefined;
  showDelay?: number;
  align?: 'left' | 'right';
  className?: string | undefined;
  children: ReactNode;
}): React.JSX.Element {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const showTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (showTimer.current !== undefined) window.clearTimeout(showTimer.current);
    },
    [],
  );

  const scheduleShow = (): void => {
    if (shown || showTimer.current !== undefined) return;
    showTimer.current = window.setTimeout(() => {
      showTimer.current = undefined;
      setShown(true);
    }, showDelay);
  };

  const cancelShow = (): void => {
    if (showTimer.current !== undefined) {
      window.clearTimeout(showTimer.current);
      showTimer.current = undefined;
    }
    setShown(false);
  };

  const position = useAnchoredPosition({
    open: shown,
    anchorRef: wrapperRef,
    floatingRef: tooltipRef,
    placement: align === 'right' ? 'bottom-end' : 'bottom-start',
    recomputeKey: label,
  });

  const handleFocus = (event: FocusEvent<HTMLSpanElement>): void => {
    if (event.target instanceof Element && event.target.matches(':focus-visible')) {
      scheduleShow();
    }
  };

  const wrapperClassName = [styles.wrapper, className].filter(Boolean).join(' ');

  return (
    <>
      <span
        ref={wrapperRef}
        className={wrapperClassName}
        onMouseEnter={scheduleShow}
        onMouseLeave={cancelShow}
        onPointerDown={cancelShow}
        onFocus={handleFocus}
        onBlur={cancelShow}
      >
        {children}
      </span>
      {shown &&
        label !== undefined &&
        createPortal(
          <span
            ref={tooltipRef}
            className={styles.tooltip}
            role="tooltip"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
