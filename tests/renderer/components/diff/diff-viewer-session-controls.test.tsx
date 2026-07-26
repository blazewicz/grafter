// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../../src/renderer/grafter-api';
import type { DiffSession } from '../../../../src/shared/contracts';
import { deferred } from '../../../support/deferred';
import {
  installDiffViewerObservers,
  type IntersectionObserverHarness,
  renderDiffViewer,
  scenario,
} from './diff-viewer-test-harness';

let intersectionObservers: IntersectionObserverHarness;

describe('DiffViewer branch comparison controls', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    cleanup();
    intersectionObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads branches once, exposes popup state, and blocks the opposite branch', async () => {
    const user = userEvent.setup();
    const branchResult = deferred<string[]>();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockReturnValue(branchResult.promise);
    renderDiffViewer();
    const sourceButton = screen.getByRole('button', { name: 'Choose source branch' });
    const targetButton = screen.getByRole('button', {
      name: 'Choose destination branch',
    });

    expect(sourceButton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(sourceButton).toHaveAttribute('aria-expanded', 'false');
    expect(targetButton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(targetButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(sourceButton);

    expect(sourceButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Choose source branch' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Filter branches' })).toHaveFocus();
    expect(screen.getByText('Loading branches…')).toBeVisible();
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith(scenario.projectId);

    await act(async () => {
      branchResult.resolve(scenario.branches.available);
      await branchResult.promise;
    });

    expect(
      await screen.findByRole('button', { name: scenario.branches.alternativeSource }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: `${scenario.branches.target}: Already selected for comparison`,
      }),
    ).toBeDisabled();

    await user.click(sourceButton);
    await user.click(targetButton);

    expect(targetButton).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', {
        name: `${scenario.branches.source}: Already selected for comparison`,
      }),
    ).toBeDisabled();
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith(scenario.projectId);
  });

  it('selects a new source and blocks duplicate commands while comparison is pending', async () => {
    const user = userEvent.setup();
    const comparisonResult = deferred<DiffSession>();
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches.available);
    const openBranchDiff = vi
      .spyOn(api, 'openBranchDiff')
      .mockReturnValue(comparisonResult.promise);
    const onSessionChange = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange,
      onClose: () => undefined,
      onError: () => undefined,
    });

    await user.click(screen.getByRole('button', { name: 'Choose source branch' }));
    await user.click(
      await screen.findByRole('button', {
        name: scenario.branches.alternativeSource,
      }),
    );

    expect(openBranchDiff).toHaveBeenCalledOnce();
    expect(openBranchDiff).toHaveBeenCalledWith({
      projectId: scenario.projectId,
      sourceBranch: scenario.branches.alternativeSource,
      targetBranch: scenario.branches.target,
    });
    const sourceButton = screen.getByRole('button', { name: 'Choose source branch' });
    const targetButton = screen.getByRole('button', {
      name: 'Choose destination branch',
    });
    const swapButton = screen.getByRole('button', {
      name: 'Swap source and destination branches',
    });
    expect(sourceButton).toBeDisabled();
    expect(targetButton).toBeDisabled();
    expect(swapButton).toBeDisabled();

    await user.click(swapButton);
    expect(openBranchDiff).toHaveBeenCalledOnce();

    await act(async () => {
      comparisonResult.resolve(scenario.detachedBranchSession);
      await comparisonResult.promise;
    });

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledOnce());
    expect(onSessionChange).toHaveBeenCalledWith(scenario.detachedBranchSession);
    expect(sourceButton).toBeEnabled();
    expect(targetButton).toBeEnabled();
    expect(swapButton).toBeEnabled();
  });

  it('selects a new destination with the current source', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches.available);
    const openBranchDiff = vi
      .spyOn(api, 'openBranchDiff')
      .mockResolvedValue(scenario.detachedBranchSession);
    const onSessionChange = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange,
      onClose: () => undefined,
      onError: () => undefined,
    });

    await user.click(screen.getByRole('button', { name: 'Choose destination branch' }));
    await user.click(
      await screen.findByRole('button', {
        name: scenario.branches.alternativeTarget,
      }),
    );

    expect(openBranchDiff).toHaveBeenCalledOnce();
    expect(openBranchDiff).toHaveBeenCalledWith({
      projectId: scenario.projectId,
      sourceBranch: scenario.branches.source,
      targetBranch: scenario.branches.alternativeTarget,
    });
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledOnce());
    expect(onSessionChange).toHaveBeenCalledWith(scenario.detachedBranchSession);
  });

  it('swaps the source and destination branches', async () => {
    const user = userEvent.setup();
    const openBranchDiff = vi
      .spyOn(api, 'openBranchDiff')
      .mockResolvedValue(scenario.detachedBranchSession);
    const onSessionChange = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange,
      onClose: () => undefined,
      onError: () => undefined,
    });

    await user.click(
      screen.getByRole('button', {
        name: 'Swap source and destination branches',
      }),
    );

    expect(openBranchDiff).toHaveBeenCalledOnce();
    expect(openBranchDiff).toHaveBeenCalledWith({
      projectId: scenario.projectId,
      sourceBranch: scenario.branches.target,
      targetBranch: scenario.branches.source,
    });
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledOnce());
    expect(onSessionChange).toHaveBeenCalledWith(scenario.detachedBranchSession);
  });

  it('does not compare an unchanged source and target pair', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches.available);
    const openBranchDiff = vi.spyOn(api, 'openBranchDiff');
    renderDiffViewer();

    await user.click(screen.getByRole('button', { name: 'Choose source branch' }));
    await user.click(
      await screen.findByRole('button', { name: scenario.branches.source }),
    );

    expect(openBranchDiff).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Choose source branch' })).toBeNull();
  });

  it('reports a friendly branch-list failure and releases its loading state', async () => {
    const user = userEvent.setup();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:list-branches': Error: failed"),
      );
    const onError = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose: () => undefined,
      onError,
    });

    await user.click(screen.getByRole('button', { name: 'Choose source branch' }));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith('failed');
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith(scenario.projectId);
    expect(screen.queryByText('Loading branches…')).toBeNull();
    expect(screen.getByText('No matching branches')).toBeVisible();
  });

  it('reports a friendly comparison failure and releases the busy controls', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches.available);
    const openBranchDiff = vi
      .spyOn(api, 'openBranchDiff')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:open-diff': Error: failed"),
      );
    const onError = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose: () => undefined,
      onError,
    });

    await user.click(screen.getByRole('button', { name: 'Choose source branch' }));
    await user.click(
      await screen.findByRole('button', {
        name: scenario.branches.alternativeSource,
      }),
    );

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith('failed');
    expect(openBranchDiff).toHaveBeenCalledOnce();
    expect(openBranchDiff).toHaveBeenCalledWith({
      projectId: scenario.projectId,
      sourceBranch: scenario.branches.alternativeSource,
      targetBranch: scenario.branches.target,
    });
    expect(screen.getByRole('button', { name: 'Choose source branch' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Choose destination branch' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'Swap source and destination branches',
      }),
    ).toBeEnabled();
  });

  it('closes branch pickers on outside pointer-down and Escape without comparing', async () => {
    const user = userEvent.setup();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockResolvedValue(scenario.branches.available);
    const openBranchDiff = vi.spyOn(api, 'openBranchDiff');
    const onClose = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });
    const sourceButton = screen.getByRole('button', { name: 'Choose source branch' });
    const outsideButton = screen.getByRole('button', { name: 'Close diff viewer' });

    await user.click(sourceButton);
    expect(screen.getByRole('dialog', { name: 'Choose source branch' })).toBeVisible();
    fireEvent.pointerDown(outsideButton);

    expect(screen.queryByRole('dialog', { name: 'Choose source branch' })).toBeNull();
    expect(openBranchDiff).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(sourceButton);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Choose source branch' })).toBeNull();
    expect(openBranchDiff).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith(scenario.projectId);
  });
});

describe('DiffViewer commit controls', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    cleanup();
    intersectionObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('copies the full hash and resets its success announcement', async () => {
    const user = userEvent.setup();
    const copyResult = deferred<void>();
    const copyText = vi.spyOn(api, 'copyText').mockReturnValue(copyResult.promise);
    renderDiffViewer(scenario.commitSession);

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

  it('reports a friendly hash-copy failure', async () => {
    const user = userEvent.setup();
    const copyText = vi
      .spyOn(api, 'copyText')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:copy-text': Error: failed"),
      );
    const onError = vi.fn();
    renderDiffViewer(scenario.commitSession, {
      onSessionChange: () => undefined,
      onClose: () => undefined,
      onError,
    });

    await user.click(screen.getByRole('button', { name: 'Copy full commit hash' }));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith('failed');
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.commitSession.commit.hash);
  });

  it('toggles details with full identity, hash, body, and multi-parent context', async () => {
    const user = userEvent.setup();
    const session = scenario.commitSession;
    renderDiffViewer(session);
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
    expect(details).toHaveTextContent(
      `Compared with first parent ${session.parentShas[0]?.slice(0, 7)} · 2 parents`,
    );

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
    renderDiffViewer(session);

    await user.click(screen.getByRole('button', { name: 'Show commit details' }));

    expect(screen.getByLabelText('Commit details')).toHaveTextContent(description);
  });

  it('shows the empty-body fallback for a root commit', async () => {
    const user = userEvent.setup();
    renderDiffViewer(scenario.rootCommitSession);

    await user.click(screen.getByRole('button', { name: 'Show commit details' }));

    expect(screen.getByText('No additional commit message.')).toBeVisible();
  });

  it('closes details on outside pointer-down and Escape without closing the viewer', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDiffViewer(scenario.commitSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });
    const detailsButton = screen.getByRole('button', { name: 'Show commit details' });
    const outsideButton = screen.getByRole('button', { name: 'Close diff viewer' });

    await user.click(detailsButton);
    fireEvent.pointerDown(outsideButton);

    expect(screen.queryByLabelText('Commit details')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(detailsButton);
    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('Commit details')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
