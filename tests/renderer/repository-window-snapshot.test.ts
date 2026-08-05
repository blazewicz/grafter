import { describe, expect, it } from 'vitest';
import {
  currentRepository,
  scopeRepositoryWindowSnapshot,
} from '../../src/renderer/repository-window-snapshot';
import { appSnapshotFactory, projectFactory } from '../factories';

describe('repository window snapshot compatibility adapter', () => {
  it('keeps only the owning repository from the legacy projects array', () => {
    const repository = projectFactory.build();
    const unrelatedRepository = projectFactory.build();
    const snapshot = appSnapshotFactory.build(
      {},
      { associations: { projects: [repository, unrelatedRepository] } },
    );

    const scoped = scopeRepositoryWindowSnapshot(snapshot);

    expect(scoped.projects).toEqual([repository]);
    expect(currentRepository(scoped)).toBe(repository);
    expect(snapshot.projects).toEqual([repository, unrelatedRepository]);
  });

  it('preserves the welcome snapshot without inventing a repository', () => {
    const snapshot = appSnapshotFactory.build({}, { associations: { projects: [] } });

    expect(scopeRepositoryWindowSnapshot(snapshot)).toBe(snapshot);
    expect(currentRepository(snapshot)).toBeUndefined();
  });
});
