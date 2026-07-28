// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BranchDiffControls } from '../../../src/renderer/diff/BranchDiffControls';
import { api } from '../../../src/renderer/grafter-api';
import type { DiffSession } from '../../../src/shared/contracts';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';
import { deferred } from '../../support/deferred';

const scenario = buildDiffViewerScenario();

function renderBranchDiffControls({
  onSessionChange = () => undefined,
  onError = () => undefined,
}: {
  onSessionChange?: (session: DiffSession) => void;
  onError?: (message: string) => void;
} = {}): void {
  render(
    <>
      <BranchDiffControls
        session={scenario.branchSession}
        onSessionChange={onSessionChange}
        onError={onError}
      />
      <button>Outside control</button>
    </>,
  );
}

describe('BranchDiffControls', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads branches once, exposes popup state, and blocks the opposite branch', async () => {
    const user = userEvent.setup();
    const branchResult = deferred<string[]>();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockReturnValue(branchResult.promise);
    renderBranchDiffControls();
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
  });

  it('selects a new source and blocks duplicate commands while comparison is pending', async () => {
    const user = userEvent.setup();
    const comparisonResult = deferred<DiffSession>();
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches.available);
    const openBranchDiff = vi
      .spyOn(api, 'openBranchDiff')
      .mockReturnValue(comparisonResult.promise);
    const onSessionChange = vi.fn();
    renderBranchDiffControls({ onSessionChange });

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
    renderBranchDiffControls({ onSessionChange });

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
    renderBranchDiffControls({ onSessionChange });

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
    renderBranchDiffControls();

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
    renderBranchDiffControls({ onError });

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
    renderBranchDiffControls({ onError });

    await user.click(screen.getByRole('button', { name: 'Choose source branch' }));
    await user.click(
      await screen.findByRole('button', {
        name: scenario.branches.alternativeSource,
      }),
    );

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith('failed');
    expect(openBranchDiff).toHaveBeenCalledOnce();
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

  it('closes a branch picker on outside pointer-down without comparing', async () => {
    const user = userEvent.setup();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockResolvedValue(scenario.branches.available);
    const openBranchDiff = vi.spyOn(api, 'openBranchDiff');
    renderBranchDiffControls();
    const sourceButton = screen.getByRole('button', { name: 'Choose source branch' });

    await user.click(sourceButton);
    expect(screen.getByRole('dialog', { name: 'Choose source branch' })).toBeVisible();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside control' }));

    expect(screen.queryByRole('dialog', { name: 'Choose source branch' })).toBeNull();
    expect(openBranchDiff).not.toHaveBeenCalled();
    expect(listBranches).toHaveBeenCalledOnce();
  });
});
