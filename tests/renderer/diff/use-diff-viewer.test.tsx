// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GrafterApi } from '../../../src/shared/contracts';
import { useDiffViewer } from '../../../src/renderer/diff/useDiffViewer';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';
import { deferred } from '../../support/deferred';

type DiffViewerApi = Pick<GrafterApi, 'openDiff' | 'openCommitDiff' | 'closeDiff'>;

const scenario = buildDiffViewerScenario();

function createApi() {
  return {
    openDiff: vi
      .fn<DiffViewerApi['openDiff']>()
      .mockResolvedValue(scenario.branchSession),
    openCommitDiff: vi
      .fn<DiffViewerApi['openCommitDiff']>()
      .mockResolvedValue(scenario.commitSession),
    closeDiff: vi.fn<DiffViewerApi['closeDiff']>().mockResolvedValue(undefined),
  } satisfies DiffViewerApi;
}

describe('useDiffViewer', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens a worktree diff and publishes its loading state and session', async () => {
    const request = deferred<typeof scenario.branchSession>();
    const api = createApi();
    api.openDiff.mockReturnValue(request.promise);
    const onError = vi.fn<(message: string) => void>();
    const { result } = renderHook(() => useDiffViewer(api, onError));

    expect(result.current.diffSession).toBeUndefined();
    expect(result.current.diffOpening).toBe(false);

    act(() => result.current.openDiff(scenario.sourceWorktree.id));

    expect(api.openDiff).toHaveBeenCalledOnce();
    expect(api.openDiff).toHaveBeenCalledWith(scenario.sourceWorktree.id);
    expect(result.current.diffOpening).toBe(true);
    expect(result.current.diffSession).toBeUndefined();

    await act(async () => {
      request.resolve(scenario.branchSession);
      await request.promise;
    });

    expect(result.current.diffSession).toEqual(scenario.branchSession);
    expect(result.current.diffOpening).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it('opens a commit diff with the selected project and commit', async () => {
    const api = createApi();
    const onError = vi.fn<(message: string) => void>();
    const { result } = renderHook(() => useDiffViewer(api, onError));

    act(() => {
      result.current.openCommitDiff(
        scenario.projectId,
        scenario.commitSession.commit.hash,
      );
    });

    expect(api.openCommitDiff).toHaveBeenCalledOnce();
    expect(api.openCommitDiff).toHaveBeenCalledWith({
      projectId: scenario.projectId,
      commitHash: scenario.commitSession.commit.hash,
    });

    await waitFor(() =>
      expect(result.current.diffSession).toEqual(scenario.commitSession),
    );
    expect(result.current.diffOpening).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a friendly error and releases the loading state when opening fails', async () => {
    const api = createApi();
    api.openDiff.mockRejectedValue(
      new Error(
        "Error invoking remote method 'grafter:open-diff': Error: comparison failed",
      ),
    );
    const onError = vi.fn<(message: string) => void>();
    const { result } = renderHook(() => useDiffViewer(api, onError));

    act(() => result.current.openDiff(scenario.sourceWorktree.id));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('comparison failed'));
    expect(onError).toHaveBeenCalledOnce();
    expect(result.current.diffSession).toBeUndefined();
    expect(result.current.diffOpening).toBe(false);
  });

  it('closes the active session and removes it from the viewer immediately', async () => {
    const api = createApi();
    const onError = vi.fn<(message: string) => void>();
    const { result } = renderHook(() => useDiffViewer(api, onError));

    act(() => result.current.openDiff(scenario.sourceWorktree.id));
    await waitFor(() =>
      expect(result.current.diffSession).toEqual(scenario.branchSession),
    );

    act(() => result.current.closeDiff());

    expect(result.current.diffSession).toBeUndefined();
    expect(api.closeDiff).toHaveBeenCalledOnce();
    expect(api.closeDiff).toHaveBeenCalledWith(scenario.branchSession.id);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a close failure after removing the active session', async () => {
    const api = createApi();
    api.closeDiff.mockRejectedValue(new Error('session cleanup failed'));
    const onError = vi.fn<(message: string) => void>();
    const { result } = renderHook(() => useDiffViewer(api, onError));

    act(() => result.current.openDiff(scenario.sourceWorktree.id));
    await waitFor(() =>
      expect(result.current.diffSession).toEqual(scenario.branchSession),
    );

    act(() => result.current.closeDiff());

    expect(result.current.diffSession).toBeUndefined();
    await waitFor(() => expect(onError).toHaveBeenCalledWith('session cleanup failed'));
    expect(onError).toHaveBeenCalledOnce();
  });

  it('replaces the active session and closes the previous one', async () => {
    const api = createApi();
    const onError = vi.fn<(message: string) => void>();
    const { result } = renderHook(() => useDiffViewer(api, onError));

    act(() => result.current.openDiff(scenario.sourceWorktree.id));
    await waitFor(() =>
      expect(result.current.diffSession).toEqual(scenario.branchSession),
    );

    act(() => result.current.replaceDiffSession(scenario.commitSession));

    expect(result.current.diffSession).toEqual(scenario.commitSession);
    expect(api.closeDiff).toHaveBeenCalledOnce();
    expect(api.closeDiff).toHaveBeenCalledWith(scenario.branchSession.id);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not close a session when replacing it with an update to the same session', async () => {
    const api = createApi();
    const onError = vi.fn<(message: string) => void>();
    const { result } = renderHook(() => useDiffViewer(api, onError));
    const updatedSession = {
      ...scenario.branchSession,
      headSha: scenario.commitSession.commit.hash,
    };

    act(() => result.current.openDiff(scenario.sourceWorktree.id));
    await waitFor(() =>
      expect(result.current.diffSession).toEqual(scenario.branchSession),
    );

    act(() => result.current.replaceDiffSession(updatedSession));

    expect(result.current.diffSession).toEqual(updatedSession);
    expect(api.closeDiff).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
