import type { CommitDiffSession, Settings } from '../../shared/contracts';
import { formatDate, formatTime } from '../date-time';
import styles from './DiffViewer.module.css';

export function CommitDiffDetails({
  session,
  settings,
  systemLocale,
}: {
  session: CommitDiffSession;
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>;
  systemLocale: string;
}): React.JSX.Element {
  const author = session.commit.authorEmail
    ? `${session.commit.authorName} <${session.commit.authorEmail}>`
    : session.commit.authorName;
  const comparison = session.parentShas.length
    ? `Compared with first parent ${session.parentShas[0]?.slice(0, 7)}${
        session.parentShas.length > 1 ? ` · ${session.parentShas.length} parents` : ''
      }`
    : 'Root commit · compared with the empty tree';

  return (
    <section className={styles.commitDetails} aria-label="Commit details">
      <div className={styles.commitDetailsMeta}>
        <time dateTime={session.commit.authoredAt} title={session.commit.authoredAt}>
          {formatDate(session.commit.authoredAt, settings.dateFormat, systemLocale)} at{' '}
          {formatTime(
            session.commit.authoredAt,
            settings.timeFormat,
            false,
            systemLocale,
          )}
        </time>
        <span aria-hidden="true">·</span>
        <span title={author}>{session.commit.authorName}</span>
        <span aria-hidden="true">·</span>
        <span>{comparison}</span>
      </div>
      {session.commit.body.trim() ? (
        <div className={styles.commitMessage}>{session.commit.body}</div>
      ) : (
        <div className={styles.commitMessageEmpty}>No additional commit message.</div>
      )}
    </section>
  );
}
