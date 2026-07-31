// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCommandApproval } from '../../../src/renderer/dialogs/useCommandApproval';
import type { AppSnapshot, GrafterApi } from '../../../src/shared/contracts';
import { approvalRequestFactory, appSnapshotFactory } from '../../factories';
import { deferred } from '../../support/deferred';

type ApprovalApi = Pick<GrafterApi, 'approveCommand' | 'rejectCommand'>;

function createApi() {
  return {
    approveCommand: vi.fn<ApprovalApi['approveCommand']>(),
    rejectCommand: vi.fn<ApprovalApi['rejectCommand']>(),
  } satisfies ApprovalApi;
}

function createRun() {
  const state = { callCount: 0 };
  return {
    state,
    run: async <T,>(
      action: () => Promise<T>,
      onSuccess?: (result: T) => void,
    ): Promise<void> => {
      state.callCount += 1;
      const result = await action();
      onSuccess?.(result);
    },
  };
}

describe('useCommandApproval', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('presents queued approvals in arrival order', async () => {
    const firstRequest = approvalRequestFactory.build();
    const secondRequest = approvalRequestFactory.build();
    const snapshot = appSnapshotFactory.build();
    const request = deferred<AppSnapshot>();
    const api = createApi();
    api.approveCommand.mockReturnValue(request.promise);
    const run = createRun();
    const applySnapshot = vi.fn<(next: AppSnapshot) => void>();
    const { result } = renderHook(() => useCommandApproval(api, run.run, applySnapshot));

    expect(result.current.approval).toBeUndefined();
    expect(result.current.approvalRunning).toBe(false);

    act(() => {
      result.current.enqueueApproval(firstRequest);
      result.current.enqueueApproval(secondRequest);
    });
    expect(result.current.approval).toEqual(firstRequest);

    act(() => result.current.resolveApproval('approve'));

    expect(result.current.approval).toEqual(firstRequest);
    expect(result.current.approvalRunning).toBe(true);
    expect(api.approveCommand).toHaveBeenCalledOnce();
    expect(api.approveCommand).toHaveBeenCalledWith(firstRequest.approvalId);

    await act(async () => {
      request.resolve(snapshot);
      await request.promise;
    });

    await waitFor(() => expect(result.current.approval).toEqual(secondRequest));
    expect(result.current.approvalRunning).toBe(false);
  });

  it.each([
    {
      decision: 'approve',
      method: 'approveCommand',
      otherMethod: 'rejectCommand',
      remainsVisible: true,
    },
    {
      decision: 'reject',
      method: 'rejectCommand',
      otherMethod: 'approveCommand',
      remainsVisible: false,
    },
  ] as const)(
    '$decision forwards the exact approval ID and applies the resulting snapshot',
    async ({ decision, method, otherMethod, remainsVisible }) => {
      const approval = approvalRequestFactory.build();
      const snapshot = appSnapshotFactory.build();
      const request = deferred<AppSnapshot>();
      const api = createApi();
      api[method].mockReturnValue(request.promise);
      const run = createRun();
      const applySnapshot = vi.fn<(next: AppSnapshot) => void>();
      const { result } = renderHook(() =>
        useCommandApproval(api, run.run, applySnapshot),
      );

      act(() => result.current.enqueueApproval(approval));
      act(() => result.current.resolveApproval(decision));

      expect(result.current.approval).toEqual(remainsVisible ? approval : undefined);
      expect(result.current.approvalRunning).toBe(remainsVisible);
      expect(run.state.callCount).toBe(1);
      expect(api[method]).toHaveBeenCalledOnce();
      expect(api[method]).toHaveBeenCalledWith(approval.approvalId);
      expect(api[otherMethod]).not.toHaveBeenCalled();
      expect(applySnapshot).not.toHaveBeenCalled();

      await act(async () => {
        request.resolve(snapshot);
        await request.promise;
      });

      await waitFor(() => expect(applySnapshot).toHaveBeenCalledWith(snapshot));
      expect(applySnapshot).toHaveBeenCalledOnce();
      expect(result.current.approval).toBeUndefined();
      expect(result.current.approvalRunning).toBe(false);
    },
  );

  it('retains new requests and ignores repeated decisions while resolving', async () => {
    const firstRequest = approvalRequestFactory.build();
    const secondRequest = approvalRequestFactory.build();
    const snapshot = appSnapshotFactory.build();
    const request = deferred<AppSnapshot>();
    const api = createApi();
    api.approveCommand.mockReturnValue(request.promise);
    const run = createRun();
    const applySnapshot = vi.fn<(next: AppSnapshot) => void>();
    const { result } = renderHook(() => useCommandApproval(api, run.run, applySnapshot));

    act(() => result.current.enqueueApproval(firstRequest));
    act(() => {
      result.current.resolveApproval('approve');
      result.current.resolveApproval('reject');
      result.current.enqueueApproval(secondRequest);
    });

    expect(result.current.approval).toEqual(firstRequest);
    expect(result.current.approvalRunning).toBe(true);
    expect(run.state.callCount).toBe(1);
    expect(api.approveCommand).toHaveBeenCalledOnce();
    expect(api.rejectCommand).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve(snapshot);
      await request.promise;
    });

    await waitFor(() => expect(result.current.approval).toEqual(secondRequest));
    expect(result.current.approvalRunning).toBe(false);
  });

  it('does nothing when resolving without a pending approval', () => {
    const api = createApi();
    const run = createRun();
    const applySnapshot = vi.fn<(next: AppSnapshot) => void>();
    const { result } = renderHook(() => useCommandApproval(api, run.run, applySnapshot));

    act(() => result.current.resolveApproval('approve'));

    expect(result.current.approval).toBeUndefined();
    expect(result.current.approvalRunning).toBe(false);
    expect(run.state.callCount).toBe(0);
    expect(api.approveCommand).not.toHaveBeenCalled();
    expect(api.rejectCommand).not.toHaveBeenCalled();
    expect(applySnapshot).not.toHaveBeenCalled();
  });
});
