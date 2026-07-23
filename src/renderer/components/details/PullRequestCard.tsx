import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  SquareArrowOutUpRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PullRequestState, PullRequest } from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';
import styles from './details.module.css';

const pullRequestStatePresentation = {
  OPEN: { icon: GitPullRequest, label: 'Open' },
  DRAFT: { icon: GitPullRequestDraft, label: 'Draft' },
  MERGED: { icon: GitMerge, label: 'Merged' },
  CLOSED: { icon: GitPullRequestClosed, label: 'Closed' },
} satisfies Record<PullRequestState, { icon: LucideIcon; label: string }>;

function PullRequestStateIcon({ state }: { state: PullRequestState }): React.JSX.Element {
  const presentation = pullRequestStatePresentation[state];
  const StateIcon = presentation.icon;

  return (
    <span
      className={styles.prStateIcon}
      data-state={state}
      role="img"
      aria-label={`Pull request status: ${presentation.label.toLowerCase()}`}
      title={`Status: ${presentation.label}`}
    >
      <StateIcon size={16} aria-hidden="true" />
    </span>
  );
}

export function openPullRequestLink(
  url: string,
  onError: (message: string) => void,
): void {
  void api.openExternal(url).catch((caught: unknown) => onError(friendlyError(caught)));
}

export function PullRequestCard({
  pullRequest,
  animatePullRequestDiscovery,
  onError,
}: {
  pullRequest: PullRequest;
  animatePullRequestDiscovery: boolean;
  onError: (message: string) => void;
}): React.JSX.Element {
  return (
    <div
      className={`${styles.prReveal} ${
        animatePullRequestDiscovery ? styles.prRevealDiscovered : ''
      }`}
    >
      <div className={styles.prRevealInner}>
        <div
          className={styles.prSubsection}
          aria-label={`Pull request #${pullRequest.number}`}
        >
          <span className={styles.sectionLabel}>PULL REQUEST</span>
          <div className={styles.prTitleRow}>
            <PullRequestStateIcon state={pullRequest.state} />
            <div className={styles.prTitleCopy}>
              <span className={styles.prNumber}>#{pullRequest.number}</span>
              <strong className={styles.prTitle}>{pullRequest.title}</strong>
            </div>
            <div className={styles.prActions}>
              <button
                className={styles.sectionActionButton}
                aria-label="Open pull request"
                title="Open pull request"
                onClick={() => openPullRequestLink(pullRequest.url, onError)}
              >
                <SquareArrowOutUpRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
