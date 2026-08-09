import { useRef, useState } from 'react';
import type {
  AppSnapshot,
  Settings,
  ToolPickerGroup,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../../shared/contracts';
import { api, friendlyError } from '../grafter-api';
import styles from './details.module.css';
import { BranchCard } from './BranchCard';
import { BranchChangesCard } from './BranchChangesCard';
import { PathCard } from './PathCard';

export function WorktreeDetailsView({
  homeDirectory,
  settings,
  systemLocale,
  details,
  projectWorktrees,
  status,
  toolPreferences,
  onSetToolPreference,
  onSnapshot,
  diffOpening = false,
  onOpenDiff,
  onOpenCommitDiff,
  onError,
}: {
  homeDirectory: string;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
  details: WorktreeDetails;
  projectWorktrees: Worktree[];
  status: WorktreeStatus | undefined;
  toolPreferences: Record<ToolPickerGroup, string>;
  onSetToolPreference: (group: ToolPickerGroup, tool: string) => void;
  onSnapshot: (snapshot: AppSnapshot) => void;
  diffOpening?: boolean;
  onOpenDiff?: () => void;
  onOpenCommitDiff?: (commitHash: string) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [copiedText, setCopiedText] = useState<string>();
  const copyResetTimer = useRef<number | undefined>(undefined);

  const copyText = (text: string): void => {
    void api
      .copyText(text)
      .then(() => {
        setCopiedText(text);
        if (copyResetTimer.current !== undefined) {
          window.clearTimeout(copyResetTimer.current);
        }
        copyResetTimer.current = window.setTimeout(() => setCopiedText(undefined), 1600);
      })
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  return (
    <div className={styles.detailsWrap}>
      <PathCard
        homeDirectory={homeDirectory}
        projectWorktrees={projectWorktrees}
        worktree={details}
        status={status}
        copiedText={copiedText}
        toolPreferences={toolPreferences}
        onSetToolPreference={onSetToolPreference}
        onCopy={copyText}
        onError={onError}
      />
      <BranchCard
        details={details}
        projectWorktrees={projectWorktrees}
        status={status}
        copiedText={copiedText}
        onSnapshot={onSnapshot}
        onCopy={copyText}
        onError={onError}
      />
      <BranchChangesCard
        details={details}
        projectWorktrees={projectWorktrees}
        settings={settings}
        systemLocale={systemLocale}
        copiedText={copiedText}
        diffOpening={diffOpening}
        onCopy={copyText}
        {...(onOpenDiff ? { onOpenDiff } : {})}
        {...(onOpenCommitDiff ? { onOpenCommitDiff } : {})}
        onError={onError}
      />
    </div>
  );
}
