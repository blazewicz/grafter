import { Factory } from 'fishery';
import type { Worktree, WorktreeDetails } from '../../src/shared/contracts';
import { worktreeFactory } from './worktree';

interface WorktreeDetailsTransientParams {
  worktree?: Worktree;
}

export const worktreeDetailsFactory = Factory.define<
  WorktreeDetails,
  WorktreeDetailsTransientParams
>(({ params, transientParams }) => {
  const worktree = transientParams.worktree ?? worktreeFactory.build();

  return {
    ...worktree,
    projectName: params.projectName ?? worktree.projectId,
  };
});
