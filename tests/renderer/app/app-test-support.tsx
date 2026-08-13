import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from '../../../src/renderer/App';
import { api } from '../../../src/renderer/grafter-api';
import type {
  AppSnapshot,
  RepositoryWindowSnapshot,
} from '../../../src/shared/contracts';
import { worktreeDetailsFactory } from '../../factories';

export type SnapshotPublisher = (snapshot: AppSnapshot) => void;

export function renderApp(
  snapshot: AppSnapshot | Promise<AppSnapshot>,
): SnapshotPublisher {
  vi.spyOn(api, 'getSnapshot').mockReturnValue(Promise.resolve(snapshot));
  let publish: SnapshotPublisher = () => undefined;
  vi.spyOn(api, 'onSnapshotUpdate').mockImplementation((listener) => {
    publish = listener;
    return () => undefined;
  });
  render(<App />);
  return publish;
}

export function stubRepositoryWindowApis(snapshot: RepositoryWindowSnapshot) {
  const refresh = vi.spyOn(api, 'refresh').mockResolvedValue(snapshot);
  const getCommandLog = vi.spyOn(api, 'getCommandLog').mockResolvedValue([]);
  vi.spyOn(api, 'getWorktreeStatus').mockResolvedValue('clean');
  const getWorktreeDetails = vi
    .spyOn(api, 'getWorktreeDetails')
    .mockImplementation((worktreeId) => {
      const project = snapshot.repository;
      const worktree = project.worktrees.find((candidate) => candidate.id === worktreeId);
      if (worktree) {
        return Promise.resolve(
          worktreeDetailsFactory.build({}, { transient: { project, worktree } }),
        );
      }
      return Promise.reject(new Error('Worktree not found.'));
    });
  return { refresh, getCommandLog, getWorktreeDetails };
}
