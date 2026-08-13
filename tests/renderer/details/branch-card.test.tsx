// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BranchCard } from '../../../src/renderer/details/BranchCard';
import { api } from '../../../src/renderer/grafter-api';
import type {
  AppSnapshot,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../../../src/shared/contracts';
import { pullRequestFactory } from '../../factories';
import { buildBranchSwitchScenario } from '../../scenarios/details/branch-switch';
import { deferred } from '../../support/deferred';

const branchScenario = buildBranchSwitchScenario();
const { mainWorktree, details, availableWorktree, switchedSnapshot } = branchScenario;

function renderBranchCard(
  options: {
    nextDetails?: WorktreeDetails;
    projectWorktrees?: Worktree[];
    status?: WorktreeStatus | undefined;
    copiedText?: string;
    onSnapshot?: (snapshot: AppSnapshot) => void;
    onCopy?: (text: string) => void;
    onError?: (message: string) => void;
  } = {},
): void {
  const {
    nextDetails = details,
    projectWorktrees = [mainWorktree, nextDetails],
    status = Object.hasOwn(options, 'status') ? undefined : 'clean',
    copiedText,
    onSnapshot = () => undefined,
    onCopy = () => undefined,
    onError = () => undefined,
  } = options;
  render(
    <BranchCard
      details={nextDetails}
      projectWorktrees={projectWorktrees}
      status={status}
      copiedText={copiedText}
      onSnapshot={onSnapshot}
      onCopy={onCopy}
      onError={onError}
    />,
  );
}

describe('BranchCard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the checked-out branch and copies its name', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    renderBranchCard({ onCopy });

    expect(screen.getByText(details.branch, { selector: 'code' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: `Copy ${details.branch} branch name` }),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: `Copy ${details.branch} branch name` }),
    );

    expect(onCopy).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledWith(details.branch);
  });

  it('shows when the branch name has been copied', () => {
    renderBranchCard({ copiedText: details.branch });

    expect(screen.getByRole('button', { name: 'Branch name copied' })).toBeVisible();
  });

  it.each([
    {
      status: 'dirty' as const,
      reason: 'Commit, stash, or discard your changes before switching branches',
    },
    {
      status: undefined,
      reason: 'Checking for local changes',
    },
  ])(
    'disables branch switching when the status is $status',
    async ({ status, reason }) => {
      const user = userEvent.setup();
      renderBranchCard({ status });

      const switchButton = screen.getByRole('button', {
        name: `Switch branch unavailable: ${reason}`,
      });
      expect(switchButton).toBeVisible();
      expect(switchButton).toHaveAttribute('aria-disabled', 'true');
      expect(switchButton).toHaveAttribute('aria-expanded', 'false');

      await user.hover(switchButton);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(reason);
      expect(
        screen.queryByRole('dialog', { name: 'Switch checked-out branch' }),
      ).toBeNull();
    },
  );

  it('opens the branch picker and loads branches', async () => {
    const user = userEvent.setup();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockResolvedValue(branchScenario.branches);
    renderBranchCard();

    const switchButton = screen.getByRole('button', {
      name: 'Switch checked-out branch',
    });
    expect(switchButton).toBeVisible();
    expect(switchButton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(switchButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(switchButton);

    expect(switchButton).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('dialog', { name: 'Switch checked-out branch' }),
    ).toBeVisible();
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith();
    expect(
      await screen.findByRole('button', { name: availableWorktree.branch }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: `${details.branch}: Currently checked out in this worktree`,
      }),
    ).toBeDisabled();
  });

  it('switches to an available branch and publishes the resulting snapshot', async () => {
    const user = userEvent.setup();
    const switchResult = deferred<AppSnapshot>();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockResolvedValue(branchScenario.branches);
    const switchBranch = vi
      .spyOn(api, 'switchBranch')
      .mockReturnValue(switchResult.promise);
    const onSnapshot = vi.fn();
    renderBranchCard({ onSnapshot });

    await user.click(screen.getByRole('button', { name: 'Switch checked-out branch' }));
    await user.click(
      await screen.findByRole('button', { name: availableWorktree.branch }),
    );

    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith();
    expect(switchBranch).toHaveBeenCalledOnce();
    expect(switchBranch).toHaveBeenCalledWith({
      worktreeId: details.id,
      branch: availableWorktree.branch,
    });
    expect(
      screen.getByRole('button', {
        name: 'Switch branch unavailable: Switching branches…',
      }),
    ).toHaveAttribute('aria-disabled', 'true');

    switchResult.resolve(switchedSnapshot);

    await waitFor(() => {
      expect(onSnapshot).toHaveBeenCalledOnce();
    });
    expect(onSnapshot).toHaveBeenCalledWith(switchedSnapshot);
    expect(
      screen.queryByRole('dialog', { name: 'Switch checked-out branch' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Switch checked-out branch' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('reports a branch-listing failure', async () => {
    const user = userEvent.setup();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:list-branches': Error: failed"),
      );
    const onError = vi.fn();
    renderBranchCard({ onError });

    await user.click(screen.getByRole('button', { name: 'Switch checked-out branch' }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('failed');
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith();
  });

  it('reports a branch-switching failure and leaves the picker open', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([availableWorktree.branch]);
    const switchBranch = vi
      .spyOn(api, 'switchBranch')
      .mockRejectedValue(new Error('could not switch'));
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    renderBranchCard({ onSnapshot, onError });

    await user.click(screen.getByRole('button', { name: 'Switch checked-out branch' }));
    await user.click(
      await screen.findByRole('button', { name: availableWorktree.branch }),
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('could not switch');
    expect(switchBranch).toHaveBeenCalledOnce();
    expect(switchBranch).toHaveBeenCalledWith({
      worktreeId: details.id,
      branch: availableWorktree.branch,
    });
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Switch checked-out branch' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Switch checked-out branch' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes the branch picker when Escape is pressed', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    renderBranchCard();

    const switchButton = screen.getByRole('button', {
      name: 'Switch checked-out branch',
    });
    await user.click(switchButton);
    expect(
      screen.getByRole('dialog', { name: 'Switch checked-out branch' }),
    ).toBeVisible();

    await user.keyboard('{Escape}');

    expect(
      screen.queryByRole('dialog', { name: 'Switch checked-out branch' }),
    ).toBeNull();
    expect(switchButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not render a pull request card when no pull request is found', () => {
    renderBranchCard();

    expect(screen.getByLabelText('Checked-out branch')).toBeVisible();
    expect(screen.queryByLabelText(/^Pull request #/)).toBeNull();
  });

  it('renders its pull request child without branch-comparison controls', () => {
    const pullRequest = pullRequestFactory.build();
    renderBranchCard({
      nextDetails: {
        ...details,
        pullRequest,
      },
    });

    expect(screen.getByLabelText('Checked-out branch')).toBeVisible();
    expect(screen.getByLabelText(`Pull request #${pullRequest.number}`)).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: `Open pull request #${pullRequest.number}: ${pullRequest.title}`,
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Branch changes')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose target branch' })).toBeNull();
  });
});
