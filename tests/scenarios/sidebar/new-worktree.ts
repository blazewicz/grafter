import type { AppSnapshot, Project } from '../../../src/shared/contracts';
import { appSnapshotFactory, projectFactory } from '../../factories';
import { fakeSlug } from '../../factories/faker';

export interface NewWorktreeScenario {
  project: Project;
  availableBranch: string;
  checkedOutBranch: string;
  branches: string[];
  suggestedPath: string;
  editedPath: string;
  createdResult: { snapshot: AppSnapshot };
}

export function buildNewWorktreeScenario(): NewWorktreeScenario {
  const project = projectFactory.build();
  const availableBranch = `feature/${fakeSlug('sidebar')}`;
  const checkedOutBranch = project.worktrees[0]?.branch ?? 'main';
  const pathSuffix = fakeSlug('worktree');

  return {
    project,
    availableBranch,
    checkedOutBranch,
    branches: [checkedOutBranch, availableBranch],
    suggestedPath: `${project.path}.worktrees/${pathSuffix}`,
    editedPath: `${project.path}.worktrees/${pathSuffix}-edited`,
    createdResult: {
      snapshot: appSnapshotFactory.build({}, { associations: { projects: [project] } }),
    },
  };
}
