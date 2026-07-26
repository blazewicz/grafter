import type { Project, Worktree } from '../../../src/shared/contracts';
import {
  mainWorktreeFactory,
  projectConfigFactory,
  projectFactory,
  worktreeFactory,
} from '../../factories';
import { fakeSlug } from '../../factories/faker';

export interface ProjectNodeScenario {
  homeDirectory: string;
  project: Project;
  expectedWorktrees: Worktree[];
  expectedTooltips: Readonly<Record<string, string>>;
  selectableWorktree: Worktree;
}

export function buildProjectNodeScenario(): ProjectNodeScenario {
  const homeDirectory = '/Users/developer';
  const projectConfig = projectConfigFactory.build();
  const mainWorktree = mainWorktreeFactory.build({
    id: `${projectConfig.id}:main`,
    projectId: projectConfig.id,
    path: projectConfig.path,
  });
  const firstByName = worktreeFactory.build({
    projectId: projectConfig.id,
    displayName: `a-${fakeSlug('worktree')}`,
    path: `${projectConfig.path}.worktrees/${fakeSlug('first')}`,
  });
  const sharedDisplayName = `m-${fakeSlug('worktree')}`;
  const firstByPath = worktreeFactory.build({
    projectId: projectConfig.id,
    displayName: sharedDisplayName,
    path: `${projectConfig.path}.worktrees/a-${fakeSlug('path')}`,
  });
  const lastByPath = worktreeFactory.build({
    projectId: projectConfig.id,
    displayName: sharedDisplayName,
    path: `${projectConfig.path}.worktrees/z-${fakeSlug('path')}`,
  });
  const expectedWorktrees = [mainWorktree, firstByName, firstByPath, lastByPath];
  const project = projectFactory.build(projectConfig, {
    associations: {
      worktrees: [lastByPath, firstByPath, firstByName, mainWorktree],
    },
  });
  const siblingDirectory = `${projectConfig.name}.worktrees`;

  return {
    homeDirectory,
    project,
    expectedWorktrees,
    expectedTooltips: {
      [mainWorktree.id]: `Main worktree · ~/Code/${projectConfig.name}`,
      [firstByName.id]: `../${siblingDirectory}/${firstByName.path.slice(
        firstByName.path.lastIndexOf('/') + 1,
      )}`,
      [firstByPath.id]: `../${siblingDirectory}/${firstByPath.path.slice(
        firstByPath.path.lastIndexOf('/') + 1,
      )}`,
      [lastByPath.id]: `../${siblingDirectory}/${lastByPath.path.slice(
        lastByPath.path.lastIndexOf('/') + 1,
      )}`,
    },
    selectableWorktree: firstByName,
  };
}
