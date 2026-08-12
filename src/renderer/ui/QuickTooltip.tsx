import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './QuickTooltip.module.css';

const tooltipGap = 5;
const viewportMargin = 8;

interface TooltipPosition {
  left: number;
  top: number;
}

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
  const [position, setPosition] = useState<TooltipPosition>();
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
      const anchor = wrapper.getBoundingClientRect();
      const tip = tooltip.getBoundingClientRect();
      let left = align === 'right' ? anchor.right - tip.width : anchor.left;
      left = Math.min(
        Math.max(left, viewportMargin),
        window.innerWidth - tip.width - viewportMargin,
      );
      let top = anchor.bottom + tooltipGap;
      if (top + tip.height > window.innerHeight - viewportMargin) {
        top = Math.max(viewportMargin, anchor.top - tooltipGap - tip.height);
      }
      setPosition({ left, top });
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
