import { Factory } from 'fishery';
import type { Worktree } from '../../src/shared/contracts';
import { fakeSlug, testFaker } from './faker';

export const worktreeFactory = Factory.define<Worktree>(({ params, sequence }) => {
  const projectId = params.projectId ?? fakeSlug('project');
  const branch = params.branch ?? testFaker.git.branch();
  const isMain = params.isMain ?? false;
  const displayName = params.displayName ?? branch.replaceAll('/', '-');

  return {
    id: params.id ?? `${projectId}:${sequence}`,
    projectId,
    displayName,
    path:
      params.path ??
      (isMain
        ? `/Users/developer/Code/${projectId}`
        : `/Users/developer/Code/${projectId}.worktrees/${displayName}`),
    branch,
    head: testFaker.git.commitSha({ length: 7 }),
    isMain,
    locked: false,
  };
});

export const mainWorktreeFactory = worktreeFactory.params({
  displayName: 'main',
  branch: 'main',
  isMain: true,
});
