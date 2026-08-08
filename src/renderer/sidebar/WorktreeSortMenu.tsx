import { Check, Ellipsis } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { WorktreeSortOrder } from '../../shared/worktree-list';
import controls from '../styles/controls.module.css';
import styles from './sidebar.module.css';

const sortOptions = [
  { value: 'path', label: 'By path' },
  { value: 'branch', label: 'By branch' },
] as const satisfies readonly { value: WorktreeSortOrder; label: string }[];

export function WorktreeSortMenu({
  value,
  onChange,
}: {
  value: WorktreeSortOrder;
  onChange: (value: WorktreeSortOrder) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();

    const closeOnPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnWindowBlur = (): void => setOpen(false);
    document.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('blur', closeOnWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('blur', closeOnWindowBlur);
    };
  }, [open]);

  const closeAndRestoreFocus = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1 + items.length) % items.length
            : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <div className={styles.sortMenu} ref={containerRef}>
      <button
        ref={triggerRef}
        className={`${controls.iconButton} ${styles.headingAction}`}
        aria-label="Worktree list options"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Worktree list options"
        onClick={() => setOpen((current) => !current)}
      >
        <Ellipsis size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={styles.sortMenuPopover}
          role="menu"
          aria-label="Sort worktrees"
          onKeyDown={handleMenuKeyDown}
        >
          <span className={styles.sortMenuLabel}>Sort</span>
          {sortOptions.map((option) => (
            <button
              key={option.value}
              className={styles.sortMenuItem}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              onClick={() => {
                onChange(option.value);
                closeAndRestoreFocus();
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={12} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
