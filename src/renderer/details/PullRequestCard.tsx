import { SquareArrowOutUpRight } from 'lucide-react';
import type { PullRequest } from '../../shared/contracts';
import { api, friendlyError } from '../grafter-api';
import { PullRequestStateIcon } from '../ui/PullRequestStateIcon';
import styles from './details.module.css';

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
            <PullRequestStateIcon
              className={styles.prStateIcon}
              state={pullRequest.state}
            />
            <div className={styles.prTitleCopy}>
              <button
                className={styles.prLink}
                aria-label={`Open pull request #${pullRequest.number}: ${pullRequest.title}`}
                title="Open pull request on GitHub"
                onClick={() => openPullRequestLink(pullRequest.url, onError)}
              >
                <strong className={styles.prTitle}>{pullRequest.title}</strong>
                <span className={styles.prNumber}>#{pullRequest.number}</span>
                <SquareArrowOutUpRight size={11} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
