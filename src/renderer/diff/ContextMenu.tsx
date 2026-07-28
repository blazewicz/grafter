import { useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import styles from './DiffViewer.module.css';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export function ContextMenu({
  position,
  ariaLabel,
  onClose,
  children,
}: {
  position: ContextMenuPosition;
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const closeOnPointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnResize = (): void => onClose();
    document.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('resize', closeOnResize);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('resize', closeOnResize);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...(menuRef.current?.querySelectorAll('button') ?? [])];
    if (!buttons.length) return;
    event.preventDefault();
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1 + buttons.length) % buttons.length
            : (currentIndex - 1 + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={
        {
          '--context-x': `${position.x}px`,
          '--context-y': `${position.y}px`,
        } as CSSProperties
      }
      role="menu"
      aria-label={ariaLabel}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

export function ContextMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.JSX.Element;
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button type="button" role="menuitem" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ContextMenuSeparator(): React.JSX.Element {
  return <div className={styles.contextMenuSeparator} role="separator" />;
}
