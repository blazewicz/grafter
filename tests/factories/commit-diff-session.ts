import { Factory } from 'fishery';
import type { CommitDiffSession } from '../../src/shared/contracts';
import { commitDetailsFactory } from './commit-details';
import { diffFileSummaryFactory } from './diff-file-summary';
import { buildDiffSessionStats, validateDiffSessionStats } from './diff-session-data';
import { diffStatsFactory } from './diff-stats';
import { fakeSlug, testFaker } from './faker';

interface CommitDiffSessionTransientParams {
  fileCount: number;
}

const emptyTreeSha = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export const commitDiffSessionFactory = Factory.define<
  CommitDiffSession,
  CommitDiffSessionTransientParams
>(({ afterBuild, params, transientParams }) => {
  const files =
    params.files ?? diffFileSummaryFactory.buildList(transientParams.fileCount ?? 1);
  const stats = params.stats
    ? diffStatsFactory.build(params.stats)
    : buildDiffSessionStats(files);
  const firstParent = params.baseSha ?? testFaker.git.commitSha();
  const parentShas = params.parentShas ?? [firstParent];
  const requestedCommitHash = params.commit?.hash ?? params.headSha;
  const commit = commitDetailsFactory.build({
    ...params.commit,
    ...(requestedCommitHash === undefined ? {} : { hash: requestedCommitHash }),
    stats,
  });

  afterBuild((session) => {
    validateDiffSessionStats(session.files, session.stats);
    if (
      session.commit.stats.files !== session.stats.files ||
      session.commit.stats.additions !== session.stats.additions ||
      session.commit.stats.deletions !== session.stats.deletions
    ) {
      throw new Error('Commit details stats must match the diff session stats.');
    }
    if (session.commit.hash !== session.headSha) {
      throw new Error('The commit hash must match the diff session head SHA.');
    }
    const expectedBaseSha = session.parentShas[0] ?? emptyTreeSha;
    if (session.baseSha !== expectedBaseSha) {
      throw new Error('The diff session base SHA must match its first parent.');
    }
  });

  return {
    kind: 'commit',
    id: params.id ?? testFaker.string.uuid(),
    projectId: params.projectId ?? fakeSlug('project'),
    baseSha: params.baseSha ?? parentShas[0] ?? emptyTreeSha,
    headSha: params.headSha ?? commit.hash,
    stats,
    files,
    commit,
    parentShas,
  };
});
