import { Factory } from 'fishery';
import type { Project } from '../../src/shared/contracts';
import { mainWorktreeFactory } from './worktree';
import {
  projectConfigFactory,
  type ProjectConfigTransientParams,
} from './project-config';

export const projectFactory = Factory.define<Project, ProjectConfigTransientParams>(
  ({ afterBuild, associations, params, transientParams }) => {
    const projectConfig = projectConfigFactory.build(params, {
      transient: transientParams,
    });

    afterBuild((project) => {
      if (project.worktrees.some((worktree) => worktree.projectId !== project.id)) {
        throw new Error('Every worktree must belong to the project.');
      }

      const mainWorktree = project.worktrees.find((worktree) => worktree.isMain);
      if (!mainWorktree) return;

      if (mainWorktree.path !== project.path) {
        throw new Error('The main worktree path must match the project path.');
      }
    });

    return {
      ...projectConfig,
      worktrees:
        associations.worktrees ??
        mainWorktreeFactory.buildList(1, {
          id: `${projectConfig.id}:main`,
          projectId: projectConfig.id,
          path: projectConfig.path,
        }),
    };
  },
);
