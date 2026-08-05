import { Factory } from 'fishery';
import type {
  LoadingWindowSnapshot,
  RepositoryWindowSnapshot,
  WelcomeWindowSnapshot,
} from '../../src/shared/contracts';
import { projectFactory } from './project';
import { recentRepositoryFactory } from './recent-repository';
import { settingsFactory } from './settings';

export const repositorySnapshotFactory = Factory.define<RepositoryWindowSnapshot>(
  ({ associations }) => ({
    kind: 'repository',
    homeDirectory: '/Users/developer',
    systemLocale: 'en-GB',
    settings: settingsFactory.build(),
    repository: associations.repository ?? projectFactory.build(),
  }),
);

export const welcomeSnapshotFactory = Factory.define<WelcomeWindowSnapshot>(
  ({ associations }) => ({
    kind: 'welcome',
    homeDirectory: '/Users/developer',
    systemLocale: 'en-GB',
    settings: settingsFactory.build(),
    recentRepositories:
      associations.recentRepositories ?? recentRepositoryFactory.buildList(2),
  }),
);

export const loadingSnapshotFactory = Factory.define<LoadingWindowSnapshot>(() => ({
  kind: 'loading',
}));
