import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './sidebar.module.css';

const tooltipGap = 4;
const viewportMargin = 8;

interface TooltipPosition {
  left: number;
  top: number;
}

interface TooltipPositionInput {
  anchor: Pick<DOMRect, 'bottom' | 'left' | 'top'>;
  tooltipHeight: number;
  tooltipWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}

export function calculateTooltipPosition({
  anchor,
  tooltipHeight,
  tooltipWidth,
  viewportHeight,
  viewportWidth,
}: TooltipPositionInput): TooltipPosition {
  const maximumLeft = Math.max(
    viewportMargin,
    viewportWidth - tooltipWidth - viewportMargin,
  );
  const left = Math.min(Math.max(anchor.left, viewportMargin), maximumLeft);
  const spaceBelow = viewportHeight - anchor.bottom - viewportMargin;
  const top =
    spaceBelow >= tooltipHeight + tooltipGap
      ? anchor.bottom + tooltipGap
      : Math.max(viewportMargin, anchor.top - tooltipHeight - tooltipGap);

  return { left, top };
}

export function SidebarTooltip({
  className,
  label,
  labelClassName,
  onlyWhenTruncated = false,
  tooltip,
  ...spanProps
}: {
  className: string | undefined;
  label: string;
  labelClassName: string | undefined;
  onlyWhenTruncated?: boolean;
  tooltip: string;
} & Omit<
  React.ComponentPropsWithoutRef<'span'>,
  'children' | 'className' | 'onMouseEnter' | 'onMouseLeave'
>): React.JSX.Element {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>();

  const showTooltip = (): void => {
    const labelElement = labelRef.current;
    if (
      onlyWhenTruncated &&
      labelElement &&
      labelElement.scrollWidth <= labelElement.clientWidth
    ) {
      return;
    }

    setOpen(true);
  };

  const hideTooltip = (): void => {
    setOpen(false);
    setPosition(undefined);
  };

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = (): void => {
      const anchorElement = anchorRef.current;
      const tooltipElement = tooltipRef.current;
      if (!anchorElement || !tooltipElement) return;

      const anchor = anchorElement.getBoundingClientRect();
      const tooltipBounds = tooltipElement.getBoundingClientRect();
      setPosition(
        calculateTooltipPosition({
          anchor,
          tooltipHeight: tooltipBounds.height,
          tooltipWidth: tooltipBounds.width,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
        }),
      );
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, tooltip]);

  return (
    <span
      {...spanProps}
      ref={anchorRef}
      className={className}
      data-tooltip-content={tooltip}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <span ref={labelRef} className={labelClassName}>
        {label}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            className={styles.sidebarTooltip}
            role="tooltip"
            style={{
              left: position?.left ?? 0,
              maxWidth: Math.max(0, window.innerWidth - viewportMargin * 2),
              top: position?.top ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            {tooltip}
          </span>,
          document.body,
        )}
    </span>
  );
}
