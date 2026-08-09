import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedOption =
    options.find((option) => option.id === selectedTool) ?? options[0];
  const selectedLabel = selectedOption?.label ?? 'Tool';
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

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !menuOpen) return;
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
  };

  const launch = (toolId: T): void => {
    setMenuOpen(false);
    onLaunch(toolId);
  };

  const openButtonTitle = disabled ? disabledReason : `Open in ${selectedLabel}`;
  const openButtonAriaLabel = disabled
    ? disabledAriaLabel
    : `${openLabelPrefix} ${selectedLabel}`;
  const menuButtonTitle = disabled ? disabledReason : chooseLabel;
  const menuButtonAriaLabel = disabled ? disabledAriaLabel : chooseAriaLabel;

  return (
    <div
      className={`${styles.toolPicker} ${compact ? styles.compact : ''}`}
      ref={menuRef}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.toolSplitButton}>
        <button
          className={styles.toolOpenButton}
          disabled={disabled}
          title={openButtonTitle}
          aria-label={openButtonAriaLabel}
          onClick={() => selectedOption && launch(selectedOption.id)}
        >
          {selectedOption?.icon}
        </button>
        <button
          className={styles.toolMenuButton}
          disabled={disabled}
          title={menuButtonTitle}
          aria-label={menuButtonAriaLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ChevronDown size={compact ? 11 : 13} />
        </button>
      </div>
      {menuOpen && (
        <div className={styles.toolMenu} role="menu">
          {options.map((option) => (
            <button key={option.id} role="menuitem" onClick={() => launch(option.id)}>
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
