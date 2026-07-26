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
>(({ afterBuild, associations, transientParams }) => {
  const project = transientParams.project ?? projectFactory.build();

  afterBuild((projectTreeItem) => {
    if (
      projectTreeItem.worktrees.some(
        (worktree) => worktree.projectId !== projectTreeItem.id,
      )
    ) {
      throw new Error('Every worktree must belong to the project.');
    }

    const mainWorktree = projectTreeItem.worktrees.find((worktree) => worktree.isMain);
    if (!mainWorktree) return;

    if (mainWorktree.path !== projectTreeItem.path) {
      throw new Error('The main worktree path must match the project path.');
    }
  });

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
