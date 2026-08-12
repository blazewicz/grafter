import type { CSSProperties, ReactNode } from 'react';
import styles from './QuickTooltip.module.css';

export function QuickTooltip({
  label,
  showDelay = 300,
  className,
  children,
}: {
  label?: string | undefined;
  showDelay?: number;
  className?: string | undefined;
  children: ReactNode;
}): React.JSX.Element {
  const wrapperClassName = [styles.wrapper, className].filter(Boolean).join(' ');
  return (
    <span
      className={wrapperClassName}
      style={{ '--quick-tooltip-delay': `${showDelay}ms` } as CSSProperties}
    >
      {children}
      {label !== undefined && (
        <span className={styles.tooltip} role="tooltip">
          {label}
        </span>
      )}
    </span>
  );
}
