import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './details.module.css';

export interface ToolPickerOption<T extends string> {
  id: T;
  label: string;
  icon: React.JSX.Element;
}

export function ToolPicker<T extends string>({
  options,
  initialTool,
  chooseLabel,
  openLabelPrefix,
  onLaunch,
}: {
  options: readonly ToolPickerOption<T>[];
  initialTool: T;
  chooseLabel: string;
  openLabelPrefix: string;
  onLaunch: (toolId: T) => void;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<T>(initialTool);
  const selectedOption = options.find((option) => option.id === selected) ?? options[0];
  const selectedLabel = selectedOption?.label ?? 'Tool';

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

  const launch = (toolId: T): void => {
    setSelected(toolId);
    setMenuOpen(false);
    onLaunch(toolId);
  };

  return (
    <div className={styles.toolPicker} ref={menuRef}>
      <div className={styles.toolSplitButton}>
        <button
          className={styles.toolOpenButton}
          title={`Open in ${selectedLabel}`}
          aria-label={`${openLabelPrefix} ${selectedLabel}`}
          onClick={() => launch(selected)}
        >
          {selectedOption?.icon}
        </button>
        <button
          className={styles.toolMenuButton}
          title={chooseLabel}
          aria-label={chooseLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {menuOpen && (
        <div className={styles.toolMenu} role="menu">
          {options.map((option) => (
            <button key={option.id} role="menuitem" onClick={() => launch(option.id)}>
              {option.icon}
              <span>{option.label}</span>
              {option.id === selected && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
