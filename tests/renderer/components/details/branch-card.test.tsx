// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BranchCard } from '../../../../src/renderer/components/details/BranchCard';
import { api } from '../../../../src/renderer/grafter-api';
import type {
  AppSnapshot,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../../../../src/shared/contracts';

const mainWorktree: Worktree = {
  id: 'project:main',
  projectId: 'project',
  displayName: 'main',
  path: '/repo',
  branch: 'main',
  head: '7654321',
  isMain: true,
  locked: false,
};

const details: WorktreeDetails = {
  id: 'project:feature',
  projectId: 'project',
  projectName: 'project',
  displayName: 'feature',
  path: '/repo.worktrees/feature',
  branch: 'feature/change',
  head: '1234567',
  isMain: false,
  locked: false,
  automaticBaseBranch: 'main',
};

const switchedWorktree: Worktree = {
  ...details,
  branch: 'feature/next',
};

const switchedSnapshot: AppSnapshot = {
  homeDirectory: '/home/kasia',
  systemLocale: 'en-GB',
  settings: {
    defaultWorktreePath: '../<repo_name>.worktrees',
    dateFormat: 'system',
    timeFormat: 'system',
  },
  projects: [
    {
      id: 'project',
      name: 'project',
      path: mainWorktree.path,
      worktrees: [mainWorktree, switchedWorktree],
    },
  ],
};

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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve = (value: T): void => {
    void value;
  };
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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
  ])('disables branch switching when the status is $status', ({ status, reason }) => {
    renderBranchCard({ status });

    const switchButton = screen.getByRole('button', {
      name: `Switch branch unavailable: ${reason}`,
    });
    expect(switchButton).toBeVisible();
    expect(switchButton).toHaveAttribute('aria-disabled', 'true');
    expect(switchButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('tooltip')).toHaveTextContent(reason);
    expect(
      screen.queryByRole('dialog', { name: 'Switch checked-out branch' }),
    ).toBeNull();
  });

  it('opens the branch picker, loads branches, and identifies checked-out branches', async () => {
    const user = userEvent.setup();
    const branches = deferred<string[]>();
    const listBranches = vi.spyOn(api, 'listBranches').mockReturnValue(branches.promise);
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
    expect(screen.getByRole('textbox', { name: 'Filter branches' })).toHaveFocus();
    expect(screen.getByText('Loading branches…')).toBeVisible();
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith(details.projectId);

    branches.resolve(['main', details.branch, 'feature/next']);

    expect(await screen.findByRole('button', { name: 'feature/next' })).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'main: Already checked out in main',
      }),
    ).toBeDisabled();
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
      .mockResolvedValue(['main', details.branch, switchedWorktree.branch]);
    const switchBranch = vi
      .spyOn(api, 'switchBranch')
      .mockReturnValue(switchResult.promise);
    const onSnapshot = vi.fn();
    renderBranchCard({ onSnapshot });

    await user.click(screen.getByRole('button', { name: 'Switch checked-out branch' }));
    await user.click(
      await screen.findByRole('button', { name: switchedWorktree.branch }),
    );

    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith(details.projectId);
    expect(switchBranch).toHaveBeenCalledOnce();
    expect(switchBranch).toHaveBeenCalledWith({
      worktreeId: details.id,
      branch: switchedWorktree.branch,
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
    expect(listBranches).toHaveBeenCalledWith(details.projectId);
    expect(screen.getByText('No matching branches')).toBeVisible();
  });

  it('reports a branch-switching failure and leaves the picker open', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([switchedWorktree.branch]);
    const switchBranch = vi
      .spyOn(api, 'switchBranch')
      .mockRejectedValue(new Error('could not switch'));
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    renderBranchCard({ onSnapshot, onError });

    await user.click(screen.getByRole('button', { name: 'Switch checked-out branch' }));
    await user.click(
      await screen.findByRole('button', { name: switchedWorktree.branch }),
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('could not switch');
    expect(switchBranch).toHaveBeenCalledOnce();
    expect(switchBranch).toHaveBeenCalledWith({
      worktreeId: details.id,
      branch: switchedWorktree.branch,
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

  it('renders its pull request child without branch-comparison controls', () => {
    renderBranchCard({
      nextDetails: {
        ...details,
        pullRequest: {
          number: 18,
          title: 'Stacked pull request',
          url: 'https://github.com/example/repo/pull/18',
          state: 'OPEN',
          baseBranch: 'feature/merged-base',
        },
      },
    });

    expect(screen.getByLabelText('Checked-out branch')).toBeVisible();
    expect(screen.getByLabelText('Pull request #18')).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Open pull request #18: Stacked pull request',
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Branch changes')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose target branch' })).toBeNull();
  });
});
