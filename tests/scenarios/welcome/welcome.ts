import type {
  RecentRepository,
  RepositoryWindowSnapshot,
  WelcomeWindowSnapshot,
} from '../../../src/shared/contracts';
import {
  repositorySnapshotFactory,
  projectFactory,
  recentRepositoryFactory,
  welcomeSnapshotFactory,
} from '../../factories';

export interface WelcomeScenario {
  emptySnapshot: WelcomeWindowSnapshot;
  openedSnapshot: RepositoryWindowSnapshot;
  recentRepositories: RecentRepository[];
}

export function buildWelcomeScenario(): WelcomeScenario {
  const recentRepositories = [
    recentRepositoryFactory.build({
      name: 'newest-repository',
      lastOpenedPath: '/Users/developer/Code/newest.worktrees/feature',
      lastOpenedAt: '2026-08-04T12:00:00.000Z',
    }),
    recentRepositoryFactory.build({
      name: 'older-repository',
      lastOpenedAt: '2026-08-03T12:00:00.000Z',
    }),
  ];
  const emptySnapshot = welcomeSnapshotFactory.build(
    {},
    { associations: { recentRepositories } },
  );

  return {
    emptySnapshot,
    openedSnapshot: repositorySnapshotFactory.build(
      {},
      {
        associations: {
          repository: projectFactory.build(),
        },
      },
    ),
    recentRepositories,
  };
}
