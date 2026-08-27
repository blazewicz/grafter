// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommitDiffControls } from '../../../src/renderer/diff/CommitDiffControls';
import { api } from '../../../src/renderer/grafter-api';
import type { CommitDiffSession } from '../../../src/shared/contracts';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';
import { deferred } from '../../support/deferred';

const scenario = buildDiffViewerScenario();
function renderCommitDiffControls(
  session: CommitDiffSession = scenario.commitSession,
  onError: (message: string) => void = () => undefined,
): void {
  render(
    <>
      <CommitDiffControls session={session} onError={onError} />
      <button>Outside control</button>
    </>,
  );
}

describe('CommitDiffControls', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('copies the full hash and resets its success announcement', async () => {
    const user = userEvent.setup();
    const copyResult = deferred<void>();
    const copyText = vi.spyOn(api, 'copyText').mockReturnValue(copyResult.promise);
    renderCommitDiffControls();

    await user.click(screen.getByRole('button', { name: 'Copy full commit hash' }));

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.commitSession.commit.hash);
    vi.useFakeTimers();
    await act(async () => {
      copyResult.resolve(undefined);
      await copyResult.promise;
    });
    expect(screen.getByRole('button', { name: 'Commit hash copied' })).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(screen.getByRole('button', { name: 'Copy full commit hash' })).toBeVisible();
  });

  it('clears pending copy feedback when unmounted', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
    const { unmount } = render(
      <CommitDiffControls session={scenario.commitSession} onError={() => undefined} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy full commit hash' }));
    await act(async () => Promise.resolve());

    expect(screen.getByRole('button', { name: 'Commit hash copied' })).toBeVisible();
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a friendly hash-copy failure', async () => {
    const user = userEvent.setup();
    const copyText = vi
      .spyOn(api, 'copyText')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:copy-text': Error: failed"),
      );
    const onError = vi.fn();
    renderCommitDiffControls(scenario.commitSession, onError);

    await user.click(screen.getByRole('button', { name: 'Copy full commit hash' }));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith('failed');
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.commitSession.commit.hash);
  });

  it('does not expose the former details popover control', () => {
    renderCommitDiffControls();

    expect(screen.queryByRole('button', { name: /commit details/i })).toBeNull();
  });
});
