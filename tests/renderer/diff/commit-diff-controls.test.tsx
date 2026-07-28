// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommitDiffControls } from '../../../src/renderer/diff/CommitDiffControls';
import { api } from '../../../src/renderer/grafter-api';
import type { CommitDiffSession } from '../../../src/shared/contracts';
import { settingsFactory } from '../../factories';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';
import { deferred } from '../../support/deferred';

const scenario = buildDiffViewerScenario();
const settings = settingsFactory.build();

function renderCommitDiffControls(
  session: CommitDiffSession = scenario.commitSession,
  onError: (message: string) => void = () => undefined,
): void {
  render(
    <>
      <CommitDiffControls
        session={session}
        settings={settings}
        systemLocale="en-US"
        onError={onError}
      />
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
      <CommitDiffControls
        session={scenario.commitSession}
        settings={settings}
        systemLocale="en-US"
        onError={() => undefined}
      />,
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

  it('toggles details with the full author identity, hash, and body', async () => {
    const user = userEvent.setup();
    const session = scenario.commitSession;
    renderCommitDiffControls(session);
    const detailsButton = screen.getByRole('button', { name: 'Show commit details' });

    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(detailsButton);

    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
    expect(detailsButton).toHaveAccessibleName('Hide commit details');
    const details = screen.getByLabelText('Commit details');
    expect(details).toHaveTextContent(
      `${session.commit.authorName} <${session.commit.authorEmail}>`,
    );
    expect(details).toHaveTextContent(session.commit.hash);
    expect(details).toHaveTextContent(session.commit.body);

    await user.click(detailsButton);

    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    expect(detailsButton).toHaveAccessibleName('Show commit details');
    expect(screen.queryByLabelText('Commit details')).toBeNull();
  });

  it.each([
    {
      name: 'first-parent commit',
      session: {
        ...scenario.commitSession,
        parentShas: [scenario.commitSession.baseSha],
      },
      description: `Compared with first parent ${scenario.commitSession.baseSha.slice(0, 7)}`,
    },
    {
      name: 'multi-parent commit',
      session: scenario.commitSession,
      description: `Compared with first parent ${scenario.commitSession.baseSha.slice(0, 7)} · 2 parents`,
    },
    {
      name: 'root commit',
      session: scenario.rootCommitSession,
      description: 'Root commit · compared with the empty tree',
    },
  ])('describes the $name comparison', async ({ session, description }) => {
    const user = userEvent.setup();
    renderCommitDiffControls(session);

    await user.click(screen.getByRole('button', { name: 'Show commit details' }));

    expect(screen.getByLabelText('Commit details')).toHaveTextContent(description);
  });

  it('shows the empty-body fallback for a root commit', async () => {
    const user = userEvent.setup();
    renderCommitDiffControls(scenario.rootCommitSession);

    await user.click(screen.getByRole('button', { name: 'Show commit details' }));

    expect(screen.getByText('No additional commit message.')).toBeVisible();
  });

  it('closes details on outside pointer-down', async () => {
    const user = userEvent.setup();
    renderCommitDiffControls();
    const detailsButton = screen.getByRole('button', { name: 'Show commit details' });

    await user.click(detailsButton);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside control' }));

    expect(screen.queryByLabelText('Commit details')).toBeNull();
  });
});
