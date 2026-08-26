import { describe, expect, it, vi } from 'vitest';
import type { RepositoryService } from '../../src/main/services/repository-service';
import { StateStore } from '../../src/main/store';
import {
  DiffWindowSession,
  type WindowSessionService,
} from '../../src/main/window-session-services';
import type { DiffSession } from '../../src/shared/contracts';
import {
  branchDiffSessionFactory,
  commitDiffSessionFactory,
  settingsFactory,
} from '../factories';

interface RepositoryStub {
  listBranches: ReturnType<typeof vi.fn>;
  openBranchDiff: ReturnType<typeof vi.fn>;
  diffFile: ReturnType<typeof vi.fn>;
  closeDiff: ReturnType<typeof vi.fn>;
  diffFileEditorTarget: ReturnType<typeof vi.fn>;
}

function repositoryStub(): RepositoryStub & Pick<RepositoryService, never> {
  return {
    listBranches: vi.fn().mockResolvedValue(['main', 'feature']),
    openBranchDiff: vi.fn(),
    diffFile: vi.fn(),
    closeDiff: vi.fn(),
    diffFileEditorTarget: vi.fn(),
  };
}

function createSession(
  repository: RepositoryStub,
  initialSession: DiffSession,
): DiffWindowSession {
  const store = new StateStore('/unused', { persist: () => Promise.resolve() });
  return new DiffWindowSession(
    repository as unknown as RepositoryService,
    store,
    { homeDirectory: '/Users/developer', systemLocale: 'en-GB' },
    initialSession,
    () => undefined,
  );
}

const initial = (): DiffSession =>
  branchDiffSessionFactory.build({ id: 'session-1', branch: 'feature' });

describe('DiffWindowSession', () => {
  it('publishes a narrow diff-window snapshot without project data', () => {
    const session = createSession(repositoryStub(), initial());

    const snapshot = session.snapshot();
    if (snapshot.kind !== 'diff') throw new Error('Expected a diff snapshot.');

    expect(snapshot.kind).toBe('diff');
    expect(snapshot.homeDirectory).toBe('/Users/developer');
    expect(snapshot.systemLocale).toBe('en-GB');
    expect(snapshot.settings).toBeDefined();
    expect(snapshot.toolPreferences).toBeDefined();
    expect(snapshot).not.toHaveProperty('repository');
    expect(snapshot).not.toHaveProperty('recentRepositories');
  });

  it('delegates list branches to the owning repository service', async () => {
    const repository = repositoryStub();
    const session = createSession(repository, initial());

    await expect(session.listBranches()).resolves.toEqual(['main', 'feature']);
    expect(repository.listBranches).toHaveBeenCalledOnce();
  });

  it('evicts the replaced session server-side when the toolbar rebases', async () => {
    const repository = repositoryStub();
    const next = branchDiffSessionFactory.build({
      id: 'session-2',
      branch: 'main',
      targetBranch: 'release',
    });
    repository.openBranchDiff.mockResolvedValue(next);
    const session = createSession(repository, initial());

    await expect(
      session.openBranchDiff({ sourceBranch: 'main', targetBranch: 'release' }),
    ).resolves.toEqual(next);

    expect(repository.closeDiff).toHaveBeenCalledWith('session-1');
  });

  it('stops tracking the current session once the window closes it', () => {
    const repository = repositoryStub();
    const session = createSession(repository, initial());

    session.closeDiff('session-1');
    session.dispose();

    // The explicit close already removed it; disposal must not double-close.
    expect(repository.closeDiff).toHaveBeenCalledTimes(1);
  });

  it('evicts a still-open session when the window is torn down', () => {
    const repository = repositoryStub();
    const session = createSession(repository, initial());

    session.dispose();

    expect(repository.closeDiff).toHaveBeenCalledWith('session-1');
  });

  it('survives an eviction failure during replacement without breaking the viewer', async () => {
    const repository = repositoryStub();
    repository.closeDiff.mockImplementation((sessionId: string) => {
      if (sessionId === 'session-1') throw new Error('already evicted');
    });
    const next = commitDiffSessionFactory.build({ id: 'session-2' });
    repository.openBranchDiff.mockResolvedValue(next);
    const session = createSession(repository, initial());

    await expect(
      session.openBranchDiff({ sourceBranch: 'x', targetBranch: 'y' }),
    ).resolves.toEqual(next);
  });

  it('persists shared settings changes and reflects them in its snapshot', async () => {
    const session = createSession(repositoryStub(), initial());

    const result = await session.updateSettings(
      settingsFactory.build({ dateFormat: 'month-day-year', timeFormat: '12-hour' }),
    );

    if (result.kind !== 'diff') throw new Error('Expected a diff snapshot.');
    expect(result.settings.dateFormat).toBe('month-day-year');
    expect(result.settings.timeFormat).toBe('12-hour');

    // Re-reads come from persisted shared state, not a cached copy.
    const refreshed = session.snapshot();
    if (refreshed.kind !== 'diff') throw new Error('Expected a diff snapshot.');
    expect(refreshed.settings.dateFormat).toBe('month-day-year');
  });

  it('rejects unavailable operations with a helpful error', () => {
    const session = createSession(repositoryStub(), initial()) as unknown as Record<
      keyof WindowSessionService,
      () => unknown
    >;

    expect(() => session.createWorktree()).toThrow(
      'This operation is not available in a diff window.',
    );
  });

  it('rejects every operation after disposal', () => {
    const repository = repositoryStub();
    const session = createSession(repository, initial());
    session.dispose();

    expect(() => session.snapshot()).toThrow('The diff window session is disposed.');
    expect(() => session.publishSnapshot()).not.toThrow();
    void repository;
  });
});
