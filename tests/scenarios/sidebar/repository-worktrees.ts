import type { Project, Worktree } from '../../../src/shared/contracts';
import {
  mainWorktreeFactory,
  projectConfigFactory,
  projectFactory,
  worktreeFactory,
} from '../../factories';
import { fakeSlug } from '../../factories/faker';

export interface RepositoryWorktreesScenario {
  homeDirectory: string;
  repository: Project;
  expectedWorktrees: Worktree[];
  expectedTooltips: Readonly<Record<string, string>>;
  selectableWorktree: Worktree;
}

export function buildRepositoryWorktreesScenario(): RepositoryWorktreesScenario {
  const homeDirectory = '/Users/developer';
  const repositoryConfig = projectConfigFactory.build();
  const mainWorktree = mainWorktreeFactory.build({
    id: `${repositoryConfig.id}:main`,
    projectId: repositoryConfig.id,
    path: repositoryConfig.path,
  });
  const firstByName = worktreeFactory.build({
    projectId: repositoryConfig.id,
    displayName: `a-${fakeSlug('worktree')}`,
    path: `${repositoryConfig.path}.worktrees/${fakeSlug('first')}`,
  });
  const sharedDisplayName = `m-${fakeSlug('worktree')}`;
  const firstByPath = worktreeFactory.build({
    projectId: repositoryConfig.id,
    displayName: sharedDisplayName,
    path: `${repositoryConfig.path}.worktrees/a-${fakeSlug('path')}`,
  });
  const lastByPath = worktreeFactory.build({
    projectId: repositoryConfig.id,
    displayName: sharedDisplayName,
    path: `${repositoryConfig.path}.worktrees/z-${fakeSlug('path')}`,
  });
  const expectedWorktrees = [mainWorktree, firstByName, firstByPath, lastByPath];
  const repository = projectFactory.build(repositoryConfig, {
    associations: {
      worktrees: [lastByPath, firstByPath, firstByName, mainWorktree],
    },
  });
  const siblingDirectory = `${repositoryConfig.name}.worktrees`;

  return {
    homeDirectory,
    repository,
    expectedWorktrees,
    expectedTooltips: {
      [mainWorktree.id]: `Main worktree · ~/Code/${repositoryConfig.name}`,
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
