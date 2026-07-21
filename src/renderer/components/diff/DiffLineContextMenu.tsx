import { Code2, Copy, ExternalLink, FileText, Hash, Link2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { DiffLineTarget } from './diff-line-context';
import styles from './DiffViewer.module.css';

export interface DiffLineContextMenuState {
  x: number;
  y: number;
  copyText: string;
  fileId: string;
  target: DiffLineTarget;
  githubUrl?: string;
  editorAvailable: boolean;
}

export function DiffLineContextMenu({
  state,
  onClose,
  onCopy,
  onOpenEditor,
  onOpenGitHub,
}: {
  state: DiffLineContextMenuState;
  onClose: () => void;
  onCopy: (text: string) => void;
  onOpenEditor: () => void;
  onOpenGitHub: () => void;
}): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const closeOnPointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnScroll = (): void => onClose();
    const closeOnResize = (): void => onClose();
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnResize);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('scroll', closeOnScroll, true);
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

  const run = (action: () => void): void => {
    onClose();
    action();
  };

  return (
    <div
      ref={menuRef}
      className={styles.lineContextMenu}
      style={
        { '--context-x': `${state.x}px`, '--context-y': `${state.y}px` } as CSSProperties
      }
      role="menu"
      aria-label="Diff line actions"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      <ContextMenuItem
        icon={<Copy size={14} />}
        label="Copy"
        onClick={() => run(() => onCopy(state.copyText))}
      />
      <ContextMenuItem
        icon={<FileText size={14} />}
        label="Copy Relative Path"
        onClick={() => run(() => onCopy(state.target.path))}
      />
      <ContextMenuItem
        icon={<Hash size={14} />}
        label="Copy Line Reference"
        onClick={() => run(() => onCopy(`${state.target.path}:${state.target.line}`))}
      />
      {(state.editorAvailable || state.githubUrl) && (
        <div className={styles.lineContextSeparator} role="separator" />
      )}
      {state.editorAvailable && (
        <ContextMenuItem
          icon={<Code2 size={14} />}
          label="Open in VS Code at Line"
          onClick={() => run(onOpenEditor)}
        />
      )}
      {state.githubUrl && (
        <>
          <ContextMenuItem
            icon={<ExternalLink size={14} />}
            label="Open on GitHub"
            onClick={() => run(onOpenGitHub)}
          />
          <ContextMenuItem
            icon={<Link2 size={14} />}
            label="Copy GitHub Permalink"
            onClick={() => run(() => onCopy(state.githubUrl ?? ''))}
          />
        </>
      )}
    </div>
  );
}

function ContextMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.JSX.Element;
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button role="menuitem" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
