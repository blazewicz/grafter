import type { AppSnapshot, RecentRepository } from '../../../src/shared/contracts';
import {
  appSnapshotFactory,
  projectFactory,
  recentRepositoryFactory,
} from '../../factories';

export interface WelcomeScenario {
  emptySnapshot: AppSnapshot;
  openedSnapshot: AppSnapshot;
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
  const emptySnapshot = appSnapshotFactory.build(
    {},
    { associations: { projects: [], recentRepositories } },
  );

  return {
    emptySnapshot,
    openedSnapshot: appSnapshotFactory.build(
      {},
      {
        associations: {
          projects: projectFactory.buildList(1),
          recentRepositories,
        },
      },
    ),
    recentRepositories,
  };
}
