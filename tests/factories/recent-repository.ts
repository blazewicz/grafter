import { Factory } from 'fishery';
import type { RecentRepository } from '../../src/shared/contracts';
import { fakeSlug, testFaker } from './faker';

export const recentRepositoryFactory = Factory.define<RecentRepository>(
  ({ params, sequence }) => {
    const name = params.name ?? fakeSlug('repository');
    const mainWorktreePath = params.mainWorktreePath ?? `/Users/developer/Code/${name}`;
    return {
      repositoryId: params.repositoryId ?? `${name}-${sequence}`,
      name,
      commonDirectoryPath: params.commonDirectoryPath ?? `${mainWorktreePath}/.git`,
      mainWorktreePath,
      lastOpenedPath: params.lastOpenedPath ?? mainWorktreePath,
      lastOpenedAt: params.lastOpenedAt ?? testFaker.date.recent().toISOString(),
    };
  },
);
