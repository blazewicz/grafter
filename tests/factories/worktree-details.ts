import path from 'node:path';
import { Factory } from 'fishery';
import type {
  ProjectConfig,
  Worktree,
  WorktreeDetails,
} from '../../src/shared/contracts';
import { projectConfigFactory } from './project-config';
import { worktreeFactory } from './worktree';

interface WorktreeDetailsTransientParams {
  project?: ProjectConfig;
  worktree?: Worktree;
}

export const worktreeDetailsFactory = Factory.define<
  WorktreeDetails,
  WorktreeDetailsTransientParams
>(({ afterBuild, params, transientParams }) => {
  const project =
    transientParams.project ??
    (transientParams.worktree ? undefined : projectConfigFactory.build());
  const worktree =
    transientParams.worktree ??
    worktreeFactory.build({
      ...(project ? { projectId: project.id } : {}),
    });
  const isMain = params.isMain ?? worktree.isMain;
  const worktreePath = params.path ?? worktree.path;

  afterBuild((details) => {
    if (transientParams.project) {
      if (details.projectId !== transientParams.project.id) {
        throw new Error('The worktree details must belong to the project.');
      }
      if (details.projectName !== transientParams.project.name) {
        throw new Error('The worktree details project name must match the project name.');
      }
    }
    if (details.isMain && details.projectName !== path.basename(details.path)) {
      throw new Error(
        'The main worktree project name must match the final part of its path.',
      );
    }
  });

  return {
    ...worktree,
    projectName:
      params.projectName ??
      project?.name ??
      (isMain ? path.basename(worktreePath) : worktree.projectId),
  };
});
