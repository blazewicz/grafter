import { Circle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type {
  EditorTool,
  TerminalTool,
  Worktree,
  WorktreeStatus,
} from '../../shared/contracts';
import { displayWorktreePath } from '../../shared/path-display';
import { api, friendlyError } from '../grafter-api';
import {
  FinderMark,
  ITermMark,
  TerminalAppMark,
  VisualStudioCodeMark,
} from '../ui/BrandMarks';
import { CopyButton } from '../ui/CopyButton';
import styles from './details.module.css';
import { ToolPicker, type ToolPickerOption } from './ToolPicker';

const editorOptions: readonly ToolPickerOption<EditorTool>[] = [
  { id: 'vscode', label: 'Visual Studio Code', icon: <VisualStudioCodeMark /> },
];

const terminalOptions: readonly ToolPickerOption<TerminalTool>[] = [
  { id: 'terminal', label: 'Terminal', icon: <TerminalAppMark /> },
  { id: 'iterm2', label: 'iTerm2', icon: <ITermMark /> },
];

export function PathCard({
  homeDirectory,
  projectWorktrees,
  worktree,
  status,
  copiedText,
  onCopy,
  onError,
}: {
  homeDirectory: string;
  worktree: Worktree;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  copiedText: string | undefined;
  onCopy: (text: string) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const copyResetTimer = useRef<number | undefined>(undefined);
  const mainClonePath =
    projectWorktrees.find((worktree) => worktree.isMain)?.path ?? worktree.path;
  const statusClass =
    status === 'dirty' ? styles.dirty : status === undefined ? styles.checking : '';

  useEffect(
    () => () => {
      if (copyResetTimer.current !== undefined) {
        window.clearTimeout(copyResetTimer.current);
      }
    },
    [],
  );

  const reportActionError = (action: Promise<void>): void => {
    void action.catch((caught: unknown) => onError(friendlyError(caught)));
  };

  const openInEditor = (nextEditor: EditorTool): void => {
    reportActionError(api.openWorktreeInEditor(worktree.id, nextEditor));
  };

  const openInTerminal = (nextTerminal: TerminalTool): void => {
    reportActionError(api.openWorktreeInTerminal(worktree.id, nextTerminal));
  };

  return (
    <section className={styles.pathCard}>
      <div className={styles.pathCopy}>
        <span className={styles.sectionLabel}>WORKTREE PATH</span>
        <div className={styles.pathValue}>
          <code>{displayWorktreePath(worktree.path, mainClonePath, homeDirectory)}</code>
          <CopyButton
            copied={copiedText === worktree.path}
            copyLabel="Copy worktree path"
            copiedLabel="Worktree path copied"
            onCopy={() => onCopy(worktree.path)}
            className={styles.pathCopyButton}
          />
          <span
            className={`${styles.cleanBadge} ${statusClass}`}
            aria-live="polite"
            title={
              status === 'clean'
                ? 'No local changes'
                : status === 'dirty'
                  ? 'Uncommitted local changes are present'
                  : 'Checking for local changes'
            }
          >
            <Circle size={7} fill="currentColor" /> {status ?? 'checking'}
          </span>
        </div>
      </div>
      <div className={styles.pathActions}>
        <button
          className={styles.sectionActionButton}
          title="Open directory"
          aria-label="Open worktree directory"
          onClick={() => reportActionError(api.openWorktreeDirectory(worktree.id))}
        >
          <FinderMark />
        </button>
        <ToolPicker
          options={terminalOptions}
          initialTool="terminal"
          chooseLabel="Choose terminal"
          openLabelPrefix="Open worktree in"
          onLaunch={openInTerminal}
        />
        <ToolPicker
          options={editorOptions}
          initialTool="vscode"
          chooseLabel="Choose IDE"
          openLabelPrefix="Open worktree in"
          onLaunch={openInEditor}
        />
      </div>
    </section>
  );
}
