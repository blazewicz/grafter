import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { QuickTooltip } from '../ui/QuickTooltip';
import { menuKeyAction, nextWrapIndex } from '../ui/menu-navigation';
import styles from './ToolPicker.module.css';

export interface ToolPickerOption<T extends string> {
  id: T;
  label: string;
  icon: React.JSX.Element;
}

export function ToolPicker<T extends string>({
  options,
  selectedTool,
  openLabelPrefix,
  chooseLabel,
  chooseAriaLabel = chooseLabel,
  onLaunch,
  disabledReason,
  disabledLabelPrefix,
  compact = false,
}: {
  options: readonly ToolPickerOption<T>[];
  selectedTool: string;
  openLabelPrefix: string;
  chooseLabel: string;
  chooseAriaLabel?: string;
  onLaunch: (toolId: T) => void;
  disabledReason?: string | undefined;
  disabledLabelPrefix?: string | undefined;
  compact?: boolean;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedOption =
    options.find((option) => option.id === selectedTool) ?? options[0];
  const selectedLabel = selectedOption?.label ?? 'Tool';
  const selectedIndex = options.findIndex((option) => option.id === selectedTool);
  const disabled = disabledReason !== undefined;
  const disabledAriaLabel = disabledLabelPrefix
    ? `${disabledLabelPrefix}: ${disabledReason}`
    : disabledReason;

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (menuOpen) itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, menuOpen]);

  const closeMenu = (returnFocus: boolean): void => {
    setMenuOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  };

  const toggleMenu = (): void => {
    if (menuOpen) {
      closeMenu(false);
    } else {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
      setMenuOpen(true);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const action = menuKeyAction(event.key);
    switch (action?.kind) {
      case 'move': {
        event.preventDefault();
        setActiveIndex((index) => nextWrapIndex(index, action.offset, options.length));
        break;
      }
      case 'home': {
        event.preventDefault();
        setActiveIndex(0);
        break;
      }
      case 'end': {
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      }
      case 'select': {
        const option = options[activeIndex];
        if (option) {
          event.preventDefault();
          launch(option.id);
        }
        break;
      }
      case 'close': {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        break;
      }
      default: {
        if (event.key === 'Tab') closeMenu(false);
        break;
      }
    }
  };

  const launch = (toolId: T): void => {
    closeMenu(false);
    onLaunch(toolId);
  };

  const openButtonLabel = disabled ? disabledReason : `Open in ${selectedLabel}`;
  const openButtonAriaLabel = disabled
    ? disabledAriaLabel
    : `${openLabelPrefix} ${selectedLabel}`;
  const menuButtonLabel = disabled ? disabledReason : chooseLabel;
  const menuButtonAriaLabel = disabled ? disabledAriaLabel : chooseAriaLabel;

  return (
    <div
      className={`${styles.toolPicker} ${compact ? styles.compact : ''}`}
      ref={menuRef}
    >
      <div className={styles.toolSplitButton}>
        <QuickTooltip label={openButtonLabel} showDelay={0} align="right">
          <button
            className={styles.toolOpenButton}
            disabled={disabled}
            aria-label={openButtonAriaLabel}
            onClick={() => selectedOption && launch(selectedOption.id)}
          >
            {selectedOption?.icon}
          </button>
        </QuickTooltip>
        <QuickTooltip
          label={menuOpen ? undefined : menuButtonLabel}
          showDelay={0}
          align="right"
        >
          <button
            ref={menuButtonRef}
            className={styles.toolMenuButton}
            disabled={disabled}
            aria-label={menuButtonAriaLabel}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <ChevronDown size={compact ? 11 : 13} />
          </button>
        </QuickTooltip>
      </div>
      {menuOpen && (
        <div className={styles.toolMenu} role="menu" onKeyDown={handleMenuKeyDown}>
          {options.map((option, index) => (
            <button
              key={option.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => launch(option.id)}
            >
              {option.icon}
              <span>{option.label}</span>
              {option.id === selectedOption?.id && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
