import { Check, Ellipsis } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { WorktreeSortOrder } from '../../shared/worktree-list';
import controls from '../styles/controls.module.css';
import { menuKeyAction, nextWrapIndex } from '../ui/menu-navigation';
import { QuickTooltip } from '../ui/QuickTooltip';
import { useDismissOutside } from '../ui/useDismissOutside';
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
  }, [open]);

  useDismissOutside({
    open,
    onClose: () => setOpen(false),
    refs: [containerRef],
    closeOnBlur: true,
    closeOnEscape: false,
  });

  const closeAndRestoreFocus = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const action = menuKeyAction(event.key);
    if (action?.kind === 'close') {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (!action || action.kind === 'select') return;
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      action.kind === 'move'
        ? nextWrapIndex(currentIndex, action.offset, items.length)
        : action.kind === 'home'
          ? 0
          : items.length - 1;
    items[nextIndex]?.focus();
  };

  return (
    <div className={styles.sortMenu} ref={containerRef}>
      <QuickTooltip
        label={open ? undefined : 'Worktree list options'}
        showDelay={0}
        align="right"
      >
        <button
          ref={triggerRef}
          className={`${controls.iconButton} ${styles.headingAction}`}
          aria-label="Worktree list options"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Ellipsis size={16} />
        </button>
      </QuickTooltip>
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
