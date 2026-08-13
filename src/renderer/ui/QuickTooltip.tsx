import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { computeFloatingRect } from './floating-position';
import styles from './QuickTooltip.module.css';

const tooltipGap = 5;
const viewportMargin = 8;

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
  const [position, setPosition] = useState<{ left: number; top: number }>();
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

  useLayoutEffect(() => {
    if (!shown) return;
    const updatePosition = (): void => {
      const wrapper = wrapperRef.current;
      const tooltip = tooltipRef.current;
      if (!wrapper || !tooltip) return;
      const next = computeFloatingRect(
        wrapper.getBoundingClientRect(),
        tooltip.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        {
          placement: align === 'right' ? 'bottom-end' : 'bottom-start',
          gap: tooltipGap,
          viewportMargin,
        },
      );
      setPosition(next);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, label, shown]);

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
