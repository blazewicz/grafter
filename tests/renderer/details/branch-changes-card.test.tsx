// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BranchChangesCard,
  isLocalComparisonCurrent,
} from '../../../src/renderer/details/BranchChangesCard';
import { api } from '../../../src/renderer/grafter-api';
import type {
  Worktree,
  WorktreeComparison,
  WorktreeDetails,
} from '../../../src/shared/contracts';
import { diffStatsFactory, settingsFactory } from '../../factories';
import { buildBranchComparisonScenario } from '../../scenarios/details/branch-comparison';
import { deferred } from '../../support/deferred';

const changesScenario = buildBranchComparisonScenario();
const {
  mainWorktree,
  details,
  availableWorktree,
  automaticComparison,
  overrideComparison,
  automaticDetails,
  overrideDetails,
} = changesScenario;
const settings = settingsFactory.build();
const comparison = {
  worktreeId: details.id,
  branch: details.branch,
  head: details.head,
  sourceAutomaticBaseBranch: mainWorktree.branch,
  ...overrideComparison,
};

function renderBranchChangesCard(
  options: {
    nextDetails?: WorktreeDetails;
    projectWorktrees?: Worktree[];
    copiedText?: string;
    diffOpening?: boolean;
    onCopy?: (text: string) => void;
    onOpenDiff?: () => void;
    onOpenCommitDiff?: (commitHash: string) => void;
    onError?: (message: string) => void;
  } = {},
): void {
  const {
    nextDetails = details,
    projectWorktrees = [mainWorktree, nextDetails],
    copiedText,
    diffOpening = false,
    onCopy = () => undefined,
    onOpenDiff,
    onOpenCommitDiff,
    onError = () => undefined,
  } = options;

  render(
    <BranchChangesCard
      details={nextDetails}
      projectWorktrees={projectWorktrees}
      settings={settings}
      systemLocale={changesScenario.snapshot.systemLocale}
      copiedText={copiedText}
      diffOpening={diffOpening}
      onCopy={onCopy}
      {...(onOpenDiff ? { onOpenDiff } : {})}
      {...(onOpenCommitDiff ? { onOpenCommitDiff } : {})}
      onError={onError}
    />,
  );
}

describe('Branch changes local comparison state', () => {
  it('accepts state created from the current worktree details', () => {
    expect(isLocalComparisonCurrent(comparison, details)).toBe(true);
  });

  it.each([
    ['worktree', { ...comparison, worktreeId: availableWorktree.id }],
    ['branch', { ...comparison, branch: availableWorktree.branch }],
    ['head', { ...comparison, head: availableWorktree.head }],
    [
      'automatic base',
      { ...comparison, sourceAutomaticBaseBranch: availableWorktree.branch },
    ],
    [
      'automatic base availability',
      { ...comparison, sourceAutomaticBaseBranchUnavailable: true },
    ],
  ])('rejects state from a different %s', (_label, staleComparison) => {
    expect(isLocalComparisonCurrent(staleComparison, details)).toBe(false);
  });
});

describe('BranchChangesCard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the target branch and copies its name', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    renderBranchChangesCard({ nextDetails: automaticDetails, onCopy });

    expect(screen.getByLabelText('Branch changes')).toBeVisible();
    expect(screen.getByText('Changes into')).toBeVisible();
    expect(
      screen.getByText(automaticComparison.targetBranch, { selector: 'code' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: `Copy ${automaticComparison.targetBranch} branch name`,
      }),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: `Copy ${automaticComparison.targetBranch} branch name`,
      }),
    );

    expect(onCopy).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledWith(automaticComparison.targetBranch);
  });

  it('shows when the target branch name has been copied', () => {
    renderBranchChangesCard({
      nextDetails: automaticDetails,
      copiedText: automaticComparison.targetBranch,
    });

    expect(screen.getByRole('button', { name: 'Branch name copied' })).toBeVisible();
  });

  it.each([
    { diffStats: diffStatsFactory.build({ files: 1 }), expected: '1 file' },
    { diffStats: diffStatsFactory.build({ files: 2 }), expected: '2 files' },
  ])('shows $expected in the comparison stats', ({ diffStats, expected }) => {
    renderBranchChangesCard({
      nextDetails: {
        ...automaticDetails,
        diffStats,
      },
    });

    const stats = screen.getByLabelText('Branch comparison stats');
    expect(within(stats).getByText(expected)).toBeVisible();
    expect(
      within(stats).getByLabelText(`${diffStats.additions} additions`),
    ).toHaveTextContent(`+${diffStats.additions}`);
    expect(
      within(stats).getByLabelText(`${diffStats.deletions} deletions`),
    ).toHaveTextContent(`−${diffStats.deletions}`);
  });

  it('opens the branch diff', async () => {
    const user = userEvent.setup();
    const onOpenDiff = vi.fn();
    vi.spyOn(api, 'listBranchCommits').mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard({
      nextDetails: automaticDetails,
      onOpenDiff,
    });

    const openDiffButton = screen.getByRole('button', { name: 'View branch diff' });
    expect(openDiffButton).toBeVisible();
    expect(openDiffButton).toBeEnabled();

    await user.click(openDiffButton);

    expect(onOpenDiff).toHaveBeenCalledOnce();
  });

  it('disables the branch diff action while a diff is opening', () => {
    vi.spyOn(api, 'listBranchCommits').mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard({
      nextDetails: automaticDetails,
      diffOpening: true,
      onOpenDiff: () => undefined,
    });

    expect(screen.getByRole('button', { name: 'View branch diff' })).toBeDisabled();
  });

  it.each([
    {
      pullRequest: undefined,
      automaticSource: 'Repository default',
    },
    {
      pullRequest: changesScenario.pullRequest,
      automaticSource: 'Pull request base',
    },
  ])(
    'identifies the automatic comparison source as $automaticSource',
    async ({ pullRequest, automaticSource }) => {
      const user = userEvent.setup();
      vi.spyOn(api, 'listBranches').mockResolvedValue([]);
      renderBranchChangesCard({
        nextDetails: {
          ...details,
          ...(pullRequest ? { pullRequest } : {}),
        },
      });

      await user.click(screen.getByRole('button', { name: 'Choose target branch' }));

      expect(
        screen.getByRole('button', {
          name: `Automatic ${mainWorktree.branch} · ${automaticSource}`,
        }),
      ).toBeVisible();
    },
  );

  it('opens the target picker, loads branches, and disables the current branch', async () => {
    const user = userEvent.setup();
    const branches = deferred<string[]>();
    const listBranches = vi.spyOn(api, 'listBranches').mockReturnValue(branches.promise);
    renderBranchChangesCard();

    const targetButton = screen.getByRole('button', { name: 'Choose target branch' });
    expect(targetButton).toBeVisible();
    expect(targetButton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(targetButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(targetButton);

    expect(targetButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Choose target branch' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Filter branches' })).toHaveFocus();
    expect(screen.getByText('Loading branches…')).toBeVisible();
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith();

    branches.resolve(changesScenario.branches);

    expect(
      await screen.findByRole('button', { name: mainWorktree.branch }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: availableWorktree.branch })).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: `${details.branch}: Already selected for comparison`,
      }),
    ).toBeDisabled();
  });

  it('selects a target branch and displays the resulting comparison', async () => {
    const user = userEvent.setup();
    const comparisonResult = deferred<WorktreeComparison>();
    vi.spyOn(api, 'listBranches').mockResolvedValue(changesScenario.branches);
    const setComparisonBase = vi
      .spyOn(api, 'setComparisonBase')
      .mockReturnValue(comparisonResult.promise);
    vi.spyOn(api, 'listBranchCommits').mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard();

    const targetButton = screen.getByRole('button', { name: 'Choose target branch' });
    await user.click(targetButton);
    await user.click(
      await screen.findByRole('button', { name: availableWorktree.branch }),
    );

    expect(setComparisonBase).toHaveBeenCalledOnce();
    expect(setComparisonBase).toHaveBeenCalledWith({
      worktreeId: details.id,
      targetBranch: availableWorktree.branch,
    });
    expect(targetButton).toBeDisabled();
    expect(screen.getByText('Updating…')).toBeVisible();

    comparisonResult.resolve(overrideComparison);

    expect(
      await screen.findByText(availableWorktree.branch, { selector: 'code' }),
    ).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Choose target branch' })).toBeNull();
    expect(targetButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Branch comparison stats')).toHaveTextContent(
      `${overrideComparison.diffStats.files} files`,
    );
  });

  it('restores the automatic comparison target', async () => {
    const user = userEvent.setup();
    const setComparisonBase = vi
      .spyOn(api, 'setComparisonBase')
      .mockResolvedValue(automaticComparison);
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    vi.spyOn(api, 'listBranchCommits').mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard({ nextDetails: overrideDetails });

    await user.click(screen.getByRole('button', { name: 'Choose target branch' }));
    await user.click(
      screen.getByRole('button', {
        name: `Automatic ${mainWorktree.branch} · Repository default`,
      }),
    );

    expect(setComparisonBase).toHaveBeenCalledOnce();
    expect(setComparisonBase).toHaveBeenCalledWith({
      worktreeId: details.id,
    });
    expect(
      await screen.findByText(mainWorktree.branch, { selector: 'code' }),
    ).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Choose target branch' })).toBeNull();
  });

  it('reports a branch-listing failure', async () => {
    const user = userEvent.setup();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:list-branches': Error: failed"),
      );
    const onError = vi.fn();
    renderBranchChangesCard({ onError });

    await user.click(screen.getByRole('button', { name: 'Choose target branch' }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('failed');
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith();
    expect(screen.getByText('No matching branches')).toBeVisible();
  });

  it('reports a comparison update failure and leaves the picker open', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([availableWorktree.branch]);
    const setComparisonBase = vi
      .spyOn(api, 'setComparisonBase')
      .mockRejectedValue(new Error('could not update comparison'));
    const onError = vi.fn();
    renderBranchChangesCard({ onError });

    await user.click(screen.getByRole('button', { name: 'Choose target branch' }));
    await user.click(
      await screen.findByRole('button', { name: availableWorktree.branch }),
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('could not update comparison');
    expect(setComparisonBase).toHaveBeenCalledOnce();
    expect(setComparisonBase).toHaveBeenCalledWith({
      worktreeId: details.id,
      targetBranch: availableWorktree.branch,
    });
    expect(screen.getByRole('dialog', { name: 'Choose target branch' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose target branch' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('closes the target picker when Escape is pressed', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    renderBranchChangesCard();

    const targetButton = screen.getByRole('button', { name: 'Choose target branch' });
    await user.click(targetButton);
    expect(screen.getByRole('dialog', { name: 'Choose target branch' })).toBeVisible();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Choose target branch' })).toBeNull();
    expect(targetButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('notifies when a pull request base is unavailable locally', () => {
    vi.spyOn(api, 'listBranchCommits').mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard({
      nextDetails: changesScenario.unavailablePullRequestDetails,
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      `PR base ${changesScenario.unavailablePullRequestDetails.pullRequest?.baseBranch} is not available locally`,
    );
    expect(
      screen.getByText(automaticComparison.targetBranch, { selector: 'code' }),
    ).toBeVisible();
  });

  it('keeps an unavailable saved comparison base visible and selectable', () => {
    renderBranchChangesCard({
      nextDetails: changesScenario.unavailableOverrideDetails,
      onOpenDiff: () => undefined,
    });

    expect(
      within(screen.getByRole('button', { name: 'Choose target branch' })).getByText(
        overrideComparison.targetBranch,
        { selector: 'code' },
      ),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      `Comparison base ${overrideComparison.targetBranch} is not available locally. Choose another branch.`,
    );
    expect(screen.getByRole('button', { name: 'Choose target branch' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'View branch diff' })).toBeNull();
    expect(screen.queryByLabelText('Commits to merge')).toBeNull();
  });

  it('renders its commit history child when a comparison is available', async () => {
    const listBranchCommits = vi
      .spyOn(api, 'listBranchCommits')
      .mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard({ nextDetails: automaticDetails });

    expect(screen.getByLabelText('Branch changes')).toBeVisible();
    expect(screen.getByLabelText('Commits to merge')).toBeVisible();
    await waitFor(() => {
      expect(listBranchCommits).toHaveBeenCalledOnce();
    });
    expect(listBranchCommits).toHaveBeenCalledWith({
      worktreeId: details.id,
      targetBranch: automaticComparison.targetBranch,
      offset: 0,
      limit: 5,
    });
  });

  it.each([
    {
      missing: 'target branch',
      nextDetails: {
        ...details,
        diffStats: automaticComparison.diffStats,
      },
    },
    {
      missing: 'comparison stats',
      nextDetails: {
        ...details,
        targetBranch: automaticComparison.targetBranch,
      },
    },
  ])('does not render its commit history child without $missing', ({ nextDetails }) => {
    const listBranchCommits = vi
      .spyOn(api, 'listBranchCommits')
      .mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard({ nextDetails });

    expect(screen.getByLabelText('Branch changes')).toBeVisible();
    expect(screen.queryByLabelText('Commits to merge')).toBeNull();
    expect(listBranchCommits).not.toHaveBeenCalled();
  });
});
