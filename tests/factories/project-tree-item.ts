import { Factory } from 'fishery';
import type { Project, ProjectTreeItem } from '../../src/shared/contracts';
import { mainWorktreeFactory } from './worktree';
import { projectFactory } from './project';

interface ProjectTreeItemTransientParams {
  project?: Project;
}

export const projectTreeItemFactory = Factory.define<
  ProjectTreeItem,
  ProjectTreeItemTransientParams
>(({ associations, transientParams }) => {
  const project = transientParams.project ?? projectFactory.build();

  return {
    ...project,
    worktrees:
      associations.worktrees ??
      mainWorktreeFactory.buildList(1, {
        id: `${project.id}:main`,
        projectId: project.id,
        path: project.path,
      }),
  };
});
