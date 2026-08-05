import type { AppSnapshot, Project, Worktree } from '../../../src/shared/contracts';
import {
  appSnapshotFactory,
  mainWorktreeFactory,
  projectConfigFactory,
  projectFactory,
  worktreeFactory,
} from '../../factories';
import { fakeSlug } from '../../factories/faker';

export interface RepositoryWindowScenario {
  snapshot: AppSnapshot;
  repository: Project;
  secondRepository: Project;
  mainWorktree: Worktree;
  linkedWorktree: Worktree;
}

export function buildRepositoryWindowScenario(): RepositoryWindowScenario {
  const config = projectConfigFactory.build({
    name: `repository-${fakeSlug('window')}`,
  });
  const mainWorktree = mainWorktreeFactory.build({
    id: `${config.id}:main`,
    projectId: config.id,
    path: config.path,
  });
  const linkedWorktree = worktreeFactory.build({
    projectId: config.id,
    displayName: `linked-${fakeSlug('worktree')}`,
    path: `${config.path}.worktrees/${fakeSlug('linked')}`,
  });
  const repository = projectFactory.build(config, {
    associations: { worktrees: [linkedWorktree, mainWorktree] },
  });
  const secondRepository = projectFactory.build();
  const snapshot = appSnapshotFactory.build(
    { selectedWorktreeId: linkedWorktree.id },
    { associations: { projects: [repository, secondRepository] } },
  );

  return {
    snapshot,
    repository,
    secondRepository,
    mainWorktree,
    linkedWorktree,
  };
}
