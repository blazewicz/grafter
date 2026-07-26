// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDiffPatches } from '../../../../src/renderer/components/diff/useDiffPatches';
import { api } from '../../../../src/renderer/grafter-api';
import type { DiffFilePatch } from '../../../../src/shared/contracts';
import { buildDiffViewerScenario } from '../../../scenarios/diff/diff-viewer';
import { deferred } from '../../../support/deferred';

const scenario = buildDiffViewerScenario();

describe('useDiffPatches', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('deduplicates file requests and publishes the resolved patch', async () => {
    const request = deferred<DiffFilePatch>();
    const getDiffFile = vi.spyOn(api, 'getDiffFile').mockReturnValue(request.promise);
    const file = scenario.files.renamed;
    const { result } = renderHook(() => useDiffPatches(scenario.branchSession.id));

    act(() => {
      result.current.requestPatch(file);
      result.current.requestPatch(file);
    });

    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
    expect(result.current.loading).toContain(file.id);

    await act(async () => {
      request.resolve(scenario.patches.textual);
      await request.promise;
    });

    expect(result.current.patches.get(file.id)).toEqual(scenario.patches.textual);
    expect(result.current.loading).not.toContain(file.id);
    expect(result.current.fileErrors.has(file.id)).toBe(false);
  });

  it('loads files concurrently and resolves them independently out of order', async () => {
    const firstRequest = deferred<DiffFilePatch>();
    const secondRequest = deferred<DiffFilePatch>();
    const firstFile = scenario.files.modified;
    const secondFile = scenario.files.renamed;
    const firstPatch = { ...scenario.patches.textual, fileId: firstFile.id };
    const secondPatch = { ...scenario.patches.textual, fileId: secondFile.id };
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockImplementation(({ fileId }) =>
        fileId === firstFile.id ? firstRequest.promise : secondRequest.promise,
      );
    const { result } = renderHook(() => useDiffPatches(scenario.branchSession.id));

    act(() => {
      result.current.requestPatch(firstFile);
      result.current.requestPatch(secondFile);
    });

    expect(getDiffFile).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toEqual(new Set([firstFile.id, secondFile.id]));

    await act(async () => {
      secondRequest.resolve(secondPatch);
      await secondRequest.promise;
    });

    expect(result.current.patches.get(secondFile.id)).toEqual(secondPatch);
    expect(result.current.patches.has(firstFile.id)).toBe(false);
    expect(result.current.loading).toEqual(new Set([firstFile.id]));

    await act(async () => {
      firstRequest.resolve(firstPatch);
      await firstRequest.promise;
    });

    expect(result.current.patches.get(firstFile.id)).toEqual(firstPatch);
    expect(result.current.loading.size).toBe(0);
  });

  it('keeps a friendly file-local error and releases loading state', async () => {
    const file = scenario.files.modified;
    vi.spyOn(api, 'getDiffFile').mockRejectedValue(
      new Error("Error invoking remote method 'grafter:diff-file': Error: failed"),
    );
    const { result } = renderHook(() => useDiffPatches(scenario.branchSession.id));

    act(() => result.current.requestPatch(file));

    await waitFor(() => expect(result.current.fileErrors.get(file.id)).toBe('failed'));
    expect(result.current.loading).not.toContain(file.id);
    expect(result.current.patches.has(file.id)).toBe(false);
  });
});
