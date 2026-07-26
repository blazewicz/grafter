import { Factory } from 'fishery';
import type { BranchDiffSession } from '../../src/shared/contracts';
import { diffFileSummaryFactory } from './diff-file-summary';
import { buildDiffSessionStats, validateDiffSessionStats } from './diff-session-data';
import { diffStatsFactory } from './diff-stats';
import { fakeSlug, testFaker } from './faker';

interface BranchDiffSessionTransientParams {
  fileCount: number;
}

export const branchDiffSessionFactory = Factory.define<
  BranchDiffSession,
  BranchDiffSessionTransientParams
>(({ afterBuild, params, transientParams }) => {
  const files =
    params.files ?? diffFileSummaryFactory.buildList(transientParams.fileCount ?? 1);
  const stats = params.stats
    ? diffStatsFactory.build(params.stats)
    : buildDiffSessionStats(files);
  const branch = params.branch ?? testFaker.git.branch();
  const generatedTargetBranch = testFaker.git.branch();
  const targetBranch =
    params.targetBranch ??
    (generatedTargetBranch === branch
      ? `${generatedTargetBranch}-${fakeSlug('base')}`
      : generatedTargetBranch);

  afterBuild((session) => validateDiffSessionStats(session.files, session.stats));

  return {
    kind: 'branch',
    id: params.id ?? testFaker.string.uuid(),
    projectId: params.projectId ?? fakeSlug('project'),
    baseSha: params.baseSha ?? testFaker.git.commitSha(),
    headSha: params.headSha ?? testFaker.git.commitSha(),
    stats,
    files,
    branch,
    targetBranch,
  };
});
