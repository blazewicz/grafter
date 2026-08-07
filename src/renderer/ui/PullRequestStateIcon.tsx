import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PullRequestState } from '../../shared/contracts';
import styles from './PullRequestStateIcon.module.css';

const pullRequestStatePresentation = {
  OPEN: { icon: GitPullRequest, label: 'Open' },
  DRAFT: { icon: GitPullRequestDraft, label: 'Draft' },
  MERGED: { icon: GitMerge, label: 'Merged' },
  CLOSED: { icon: GitPullRequestClosed, label: 'Closed' },
} satisfies Record<PullRequestState, { icon: LucideIcon; label: string }>;

export function PullRequestStateIcon({
  state,
  size = 16,
  className,
}: {
  state: PullRequestState;
  size?: number;
  className?: string | undefined;
}): React.JSX.Element {
  const presentation = pullRequestStatePresentation[state];
  const StateIcon = presentation.icon;

  return (
    <span
      className={`${styles.icon ?? ''} ${className ?? ''}`}
      data-state={state}
      role="img"
      aria-label={`Pull request status: ${presentation.label.toLowerCase()}`}
      title={`Status: ${presentation.label}`}
    >
      <StateIcon size={size} aria-hidden="true" />
    </span>
  );
}
