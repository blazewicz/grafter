// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BranchChangesCard,
  isLocalComparisonCurrent,
} from '../../../../src/renderer/components/details/BranchChangesCard';
import { api } from '../../../../src/renderer/grafter-api';
import type {
  Worktree,
  WorktreeComparison,
  WorktreeDetails,
} from '../../../../src/shared/contracts';
import { pullRequestFactory, worktreeComparisonFactory } from '../../../factories';
import { buildWorktreeProjectScenario } from '../../../scenarios/details/worktree-project';
import { deferred } from '../../../support/deferred';

const changesScenario = buildWorktreeProjectScenario({
  project: { id: 'project', name: 'project', path: '/repo' },
  mainWorktree: { head: '7654321' },
  details: {
    id: 'project:feature',
    displayName: 'feature',
    path: '/repo.worktrees/feature',
    branch: 'feature/change',
    head: '1234567',
    automaticBaseBranch: 'main',
  },
});
const { mainWorktree, details } = changesScenario;
const comparison = {
  worktreeId: details.id,
  branch: details.branch,
  head: details.head,
  sourceAutomaticBaseBranch: 'main',
  ...worktreeComparisonFactory.build({
    targetBranch: 'release/next',
    comparisonBaseOverride: 'release/next',
    diffStats: { files: 1, additions: 2, deletions: 1 },
  }),
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
      settings={{ dateFormat: 'year-month-day', timeFormat: '24-hour' }}
      systemLocale="en-GB"
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
    ['worktree', { ...comparison, worktreeId: 'project:other' }],
    ['branch', { ...comparison, branch: 'feature/other' }],
    ['head', { ...comparison, head: '7654321' }],
    ['automatic base', { ...comparison, sourceAutomaticBaseBranch: 'develop' }],
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
    const nextDetails: WorktreeDetails = {
      ...details,
      targetBranch: 'main',
    };
    renderBranchChangesCard({ nextDetails, onCopy });

    expect(screen.getByLabelText('Branch changes')).toBeVisible();
    expect(screen.getByText('Changes into')).toBeVisible();
    expect(screen.getByText('main', { selector: 'code' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy main branch name' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Copy main branch name' }));

    expect(onCopy).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledWith('main');
  });

  it('shows when the target branch name has been copied', () => {
    renderBranchChangesCard({
      nextDetails: { ...details, targetBranch: 'main' },
      copiedText: 'main',
    });

    expect(screen.getByRole('button', { name: 'Branch name copied' })).toBeVisible();
  });

  it.each([
    { files: 1, expected: '1 file' },
    { files: 2, expected: '2 files' },
  ])('shows $expected in the comparison stats', ({ files, expected }) => {
    renderBranchChangesCard({
      nextDetails: {
        ...details,
        targetBranch: 'main',
        diffStats: { files, additions: 8, deletions: 3 },
      },
    });

    const stats = screen.getByLabelText('Branch comparison stats');
    expect(within(stats).getByText(expected)).toBeVisible();
    expect(within(stats).getByLabelText('8 additions')).toHaveTextContent('+8');
    expect(within(stats).getByLabelText('3 deletions')).toHaveTextContent('−3');
  });

  it('opens the branch diff', async () => {
    const user = userEvent.setup();
    const onOpenDiff = vi.fn();
    vi.spyOn(api, 'listBranchCommits').mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard({
      nextDetails: {
        ...details,
        targetBranch: 'main',
        diffStats: { files: 2, additions: 8, deletions: 3 },
      },
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
      nextDetails: {
        ...details,
        targetBranch: 'main',
        diffStats: { files: 2, additions: 8, deletions: 3 },
      },
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
      pullRequest: pullRequestFactory.build({
        number: 18,
        title: 'Stacked pull request',
        url: 'https://github.com/example/repo/pull/18',
        state: 'OPEN',
        baseBranch: 'main',
      }),
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
          name: `Automatic main · ${automaticSource}`,
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
    expect(listBranches).toHaveBeenCalledWith(details.projectId);

    branches.resolve(['main', details.branch, 'release/next']);

    expect(await screen.findByRole('button', { name: 'main' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'release/next' })).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: `${details.branch}: Already selected for comparison`,
      }),
    ).toBeDisabled();
  });

  it('selects a target branch and displays the resulting comparison', async () => {
    const user = userEvent.setup();
    const comparisonResult = deferred<WorktreeComparison>();
    vi.spyOn(api, 'listBranches').mockResolvedValue([
      'main',
      details.branch,
      'release/next',
    ]);
    const setComparisonBase = vi
      .spyOn(api, 'setComparisonBase')
      .mockReturnValue(comparisonResult.promise);
    vi.spyOn(api, 'listBranchCommits').mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard();

    const targetButton = screen.getByRole('button', { name: 'Choose target branch' });
    await user.click(targetButton);
    await user.click(await screen.findByRole('button', { name: 'release/next' }));

    expect(setComparisonBase).toHaveBeenCalledOnce();
    expect(setComparisonBase).toHaveBeenCalledWith({
      worktreeId: details.id,
      targetBranch: 'release/next',
    });
    expect(targetButton).toBeDisabled();
    expect(screen.getByText('Updating…')).toBeVisible();

    comparisonResult.resolve(
      worktreeComparisonFactory.build({
        automaticBaseBranch: 'main',
        targetBranch: 'release/next',
        comparisonBaseOverride: 'release/next',
        diffStats: { files: 4, additions: 91, deletions: 26 },
      }),
    );

    expect(await screen.findByText('release/next', { selector: 'code' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Choose target branch' })).toBeNull();
    expect(targetButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Branch comparison stats')).toHaveTextContent('4 files');
  });

  it('restores the automatic comparison target', async () => {
    const user = userEvent.setup();
    const setComparisonBase = vi.spyOn(api, 'setComparisonBase').mockResolvedValue(
      worktreeComparisonFactory.build({
        automaticBaseBranch: 'main',
        targetBranch: 'main',
        diffStats: { files: 2, additions: 8, deletions: 3 },
      }),
    );
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    vi.spyOn(api, 'listBranchCommits').mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard({
      nextDetails: {
        ...details,
        targetBranch: 'release/next',
        comparisonBaseOverride: 'release/next',
        diffStats: { files: 4, additions: 91, deletions: 26 },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Choose target branch' }));
    await user.click(
      screen.getByRole('button', {
        name: 'Automatic main · Repository default',
      }),
    );

    expect(setComparisonBase).toHaveBeenCalledOnce();
    expect(setComparisonBase).toHaveBeenCalledWith({
      worktreeId: details.id,
    });
    expect(await screen.findByText('main', { selector: 'code' })).toBeVisible();
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
    expect(listBranches).toHaveBeenCalledWith(details.projectId);
    expect(screen.getByText('No matching branches')).toBeVisible();
  });

  it('reports a comparison update failure and leaves the picker open', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(['release/next']);
    const setComparisonBase = vi
      .spyOn(api, 'setComparisonBase')
      .mockRejectedValue(new Error('could not update comparison'));
    const onError = vi.fn();
    renderBranchChangesCard({ onError });

    await user.click(screen.getByRole('button', { name: 'Choose target branch' }));
    await user.click(await screen.findByRole('button', { name: 'release/next' }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('could not update comparison');
    expect(setComparisonBase).toHaveBeenCalledOnce();
    expect(setComparisonBase).toHaveBeenCalledWith({
      worktreeId: details.id,
      targetBranch: 'release/next',
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
      nextDetails: {
        ...details,
        pullRequest: pullRequestFactory.build({
          number: 18,
          title: 'Stacked pull request',
          url: 'https://github.com/example/repo/pull/18',
          state: 'OPEN',
          baseBranch: 'feature/merged-base',
        }),
        automaticBaseBranch: 'feature/merged-base',
        automaticBaseBranchUnavailable: true,
        targetBranch: 'main',
        diffStats: { files: 1, additions: 2, deletions: 1 },
      },
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'PR base feature/merged-base is not available locally',
    );
    expect(screen.getByText('main', { selector: 'code' })).toBeVisible();
  });

  it('keeps an unavailable saved comparison base visible and selectable', () => {
    renderBranchChangesCard({
      nextDetails: {
        ...details,
        targetBranch: 'release/next',
        comparisonBaseOverride: 'release/next',
        comparisonBaseOverrideUnavailable: true,
      },
      onOpenDiff: () => undefined,
    });

    expect(
      within(screen.getByRole('button', { name: 'Choose target branch' })).getByText(
        'release/next',
        { selector: 'code' },
      ),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Comparison base release/next is not available locally. Choose another branch.',
    );
    expect(screen.getByRole('button', { name: 'Choose target branch' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'View branch diff' })).toBeNull();
    expect(screen.queryByLabelText('Commits to merge')).toBeNull();
  });

  it('renders its commit history child when a comparison is available', async () => {
    const listBranchCommits = vi
      .spyOn(api, 'listBranchCommits')
      .mockReturnValue(new Promise(() => undefined));
    renderBranchChangesCard({
      nextDetails: {
        ...details,
        targetBranch: 'main',
        diffStats: { files: 2, additions: 8, deletions: 3 },
      },
    });

    expect(screen.getByLabelText('Branch changes')).toBeVisible();
    expect(screen.getByLabelText('Commits to merge')).toBeVisible();
    await waitFor(() => {
      expect(listBranchCommits).toHaveBeenCalledOnce();
    });
    expect(listBranchCommits).toHaveBeenCalledWith({
      worktreeId: details.id,
      targetBranch: 'main',
      offset: 0,
      limit: 5,
    });
  });

  it.each([
    {
      missing: 'target branch',
      nextDetails: {
        ...details,
        diffStats: { files: 2, additions: 8, deletions: 3 },
      },
    },
    {
      missing: 'comparison stats',
      nextDetails: {
        ...details,
        targetBranch: 'main',
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
