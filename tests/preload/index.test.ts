import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrafterApi } from '../../src/shared/contracts';
import { ipc } from '../../src/shared/ipc';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn<(key: string, api: GrafterApi) => void>(),
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));

await import('../../src/preload/index');

function exposedApi(): GrafterApi {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  if (!api) throw new Error('Expected the preload API to be exposed.');
  return api;
}

describe('preload repository-scoped API', () => {
  beforeEach(() => {
    electron.invoke.mockReset().mockResolvedValue(undefined);
  });

  it('sends no caller-selected repository identifier for scoped operations', async () => {
    const api = exposedApi();
    const createRequest = { branch: 'feature/scoped', path: '/repo.worktrees/scoped' };

    await api.refresh();
    await api.listBranches();
    await api.suggestWorktreePath(createRequest.branch);
    await api.createWorktree(createRequest);
    await api.openBranchDiff({
      sourceBranch: createRequest.branch,
      targetBranch: 'main',
    });
    await api.openCommitDiff({ commitHash: '1'.repeat(40) });
    await api.updateRepositorySetup('npm install');
    await api.getCommandLog({
      kind: 'worktree',
      worktreeId: 'owning-repository:worktree',
    });

    expect(electron.invoke.mock.calls).toEqual([
      [ipc.refresh],
      [ipc.listBranches],
      [ipc.suggestWorktreePath, createRequest.branch],
      [ipc.createWorktree, createRequest],
      [ipc.openBranchDiff, { sourceBranch: createRequest.branch, targetBranch: 'main' }],
      [ipc.openCommitDiff, { commitHash: '1'.repeat(40) }],
      [ipc.updateRepositorySetup, 'npm install'],
      [ipc.commandLog, { kind: 'worktree', worktreeId: 'owning-repository:worktree' }],
    ]);
  });

  it('does not expose project CRUD or multi-project snapshot adapters', () => {
    const api = exposedApi();

    expect(api).not.toHaveProperty('addProject');
    expect(api).not.toHaveProperty('removeProject');
    expect(api).not.toHaveProperty('refreshProject');
  });
});
