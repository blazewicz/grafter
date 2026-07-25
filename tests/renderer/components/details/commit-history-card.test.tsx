// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendCommitPage,
  CommitHistoryCard,
} from '../../../../src/renderer/components/details/CommitHistoryCard';
import { formatDate, formatTime } from '../../../../src/renderer/date-time';
import { api } from '../../../../src/renderer/grafter-api';
import type { BranchCommitPage } from '../../../../src/shared/contracts';
import { branchCommitFactory, branchCommitPageFactory } from '../../../factories';
import { deferred } from '../../../support/deferred';

const worktreeId = 'project:feature';
const targetBranch = 'main';
const dateSettings = {
  dateFormat: 'year-month-day',
  timeFormat: '24-hour',
} as const;

const newest = branchCommitFactory.build({
  hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  title: 'Newest change',
  authorName: 'Ada Lovelace',
  authorEmail: 'ada@example.com',
  authoredAt: '2026-07-22T15:18:00+02:00',
});

const earlier = branchCommitFactory.build(
  {
    hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    title: 'Earlier change',
    authorName: 'Grace Hopper',
    authoredAt: '2026-07-21T09:30:00Z',
  },
  {
    transient: { withAuthorEmail: false },
  },
);

function renderCommitHistoryCard(
  options: {
    copiedText?: string;
    opening?: boolean;
    onCopy?: (text: string) => void;
    onViewChanges?: (commitHash: string) => void;
    onError?: (message: string) => void;
  } = {},
): void {
  const {
    copiedText,
    opening = false,
    onCopy = () => undefined,
    onViewChanges,
    onError = () => undefined,
  } = options;

  render(
    <CommitHistoryCard
      worktreeId={worktreeId}
      targetBranch={targetBranch}
      settings={dateSettings}
      systemLocale="en-GB"
      copiedText={copiedText}
      opening={opening}
      onCopy={onCopy}
      {...(onViewChanges ? { onViewChanges } : {})}
      onError={onError}
    />,
  );
}

describe('CommitHistoryCard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads the first page of commits', () => {
    const firstPage = deferred<BranchCommitPage>();
    const listBranchCommits = vi
      .spyOn(api, 'listBranchCommits')
      .mockReturnValue(firstPage.promise);
    renderCommitHistoryCard();

    expect(screen.getByLabelText('Commits to merge')).toBeVisible();
    expect(screen.getByText('Loading commits…')).toBeVisible();
    expect(listBranchCommits).toHaveBeenCalledOnce();
    expect(listBranchCommits).toHaveBeenCalledWith({
      worktreeId,
      targetBranch,
      offset: 0,
      limit: 5,
    });
  });

  it('shows an empty state when there are no commits to merge', async () => {
    vi.spyOn(api, 'listBranchCommits').mockResolvedValue(
      branchCommitPageFactory.build({ commits: [], total: 0, hasMore: false }),
    );
    renderCommitHistoryCard();

    expect(await screen.findByText('No commits to merge.')).toBeVisible();
    expect(screen.getByText('0 commits')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('reports an initial loading failure', async () => {
    const listBranchCommits = vi
      .spyOn(api, 'listBranchCommits')
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'grafter:list-branch-commits': Error: failed",
        ),
      );
    const onError = vi.fn();
    renderCommitHistoryCard({ onError });

    expect(await screen.findByText('Could not load commits.')).toBeVisible();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('failed');
    expect(listBranchCommits).toHaveBeenCalledOnce();
    expect(listBranchCommits).toHaveBeenCalledWith({
      worktreeId,
      targetBranch,
      offset: 0,
      limit: 5,
    });
  });

  it('shows commits newest first with compact metadata', async () => {
    vi.spyOn(api, 'listBranchCommits').mockResolvedValue(
      branchCommitPageFactory.build({
        commits: [newest, earlier],
        total: 2,
        hasMore: true,
      }),
    );
    renderCommitHistoryCard({
      copiedText: earlier.hash,
      onViewChanges: () => undefined,
    });

    const card = screen.getByLabelText('Commits to merge');
    expect(await within(card).findByText('2 commits')).toBeVisible();
    expect(
      within(card)
        .getAllByRole('button', { name: /^View changes in / })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['View changes in bbbbbbb', 'View changes in aaaaaaa']);

    const newestHash = within(card).getByText('bbbbbbb', { selector: 'code' });
    expect(newestHash).toHaveAttribute('title', newest.hash);
    expect(within(card).getByText(newest.title)).toHaveAttribute('title', newest.title);
    expect(within(card).getByText(newest.authorName)).toHaveAttribute(
      'title',
      `${newest.authorName} <${newest.authorEmail}>`,
    );
    expect(within(card).getByText(earlier.authorName)).toHaveAttribute(
      'title',
      earlier.authorName,
    );
    expect(
      within(card).getByText(
        `${formatDate(
          newest.authoredAt,
          dateSettings.dateFormat,
          'en-GB',
        )} at ${formatTime(newest.authoredAt, dateSettings.timeFormat, false, 'en-GB')}`,
      ),
    ).toHaveAttribute('datetime', newest.authoredAt);
    expect(
      within(card).getByRole('button', {
        name: `Copy ${newest.hash} commit hash`,
      }),
    ).toBeVisible();
    expect(
      within(card).getByRole('button', { name: 'Commit hash copied' }),
    ).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Show more' })).toBeVisible();
  });

  it('uses a singular count for one commit', async () => {
    vi.spyOn(api, 'listBranchCommits').mockResolvedValue(
      branchCommitPageFactory.build({
        commits: [newest],
        total: 1,
        hasMore: false,
      }),
    );
    renderCommitHistoryCard();

    expect(await screen.findByText('1 commit')).toBeVisible();
    expect(screen.queryByText('1 commits')).toBeNull();
  });

  it('falls back to an untitled label for a commit without a title', async () => {
    vi.spyOn(api, 'listBranchCommits').mockResolvedValue(
      branchCommitPageFactory.build({
        commits: [branchCommitFactory.build({ ...newest, title: '' })],
        total: 1,
        hasMore: false,
      }),
    );
    renderCommitHistoryCard();

    expect(await screen.findByText('Untitled commit')).toBeVisible();
  });

  it('copies a commit hash', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranchCommits').mockResolvedValue(
      branchCommitPageFactory.build({
        commits: [newest],
        total: 1,
        hasMore: false,
      }),
    );
    const onCopy = vi.fn();
    renderCommitHistoryCard({ onCopy });

    const copyButton = await screen.findByRole('button', {
      name: `Copy ${newest.hash} commit hash`,
    });
    expect(copyButton).toBeVisible();
    await user.click(copyButton);

    expect(onCopy).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledWith(newest.hash);
  });

  it('opens the changes for a commit', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranchCommits').mockResolvedValue(
      branchCommitPageFactory.build({
        commits: [newest],
        total: 1,
        hasMore: false,
      }),
    );
    const onViewChanges = vi.fn();
    renderCommitHistoryCard({ onViewChanges });

    const viewChangesButton = await screen.findByRole('button', {
      name: 'View changes in bbbbbbb',
    });
    expect(viewChangesButton).toBeVisible();
    expect(viewChangesButton).toHaveAttribute('title', 'View commit changes');
    await user.click(viewChangesButton);

    expect(onViewChanges).toHaveBeenCalledOnce();
    expect(onViewChanges).toHaveBeenCalledWith(newest.hash);
  });

  it('does not show commit diff actions without a view-changes callback', async () => {
    vi.spyOn(api, 'listBranchCommits').mockResolvedValue(
      branchCommitPageFactory.build({
        commits: [newest],
        total: 1,
        hasMore: false,
      }),
    );
    renderCommitHistoryCard();

    expect(await screen.findByText(newest.title)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^View changes in / })).toBeNull();
  });

  it('disables commit diff actions while a diff is opening', async () => {
    vi.spyOn(api, 'listBranchCommits').mockResolvedValue(
      branchCommitPageFactory.build({
        commits: [newest, earlier],
        total: 2,
        hasMore: false,
      }),
    );
    renderCommitHistoryCard({
      opening: true,
      onViewChanges: () => undefined,
    });

    const viewChangesButtons = await screen.findAllByRole('button', {
      name: /^View changes in /,
    });
    expect(viewChangesButtons).toHaveLength(2);
    for (const button of viewChangesButtons) {
      expect(button).toBeDisabled();
    }
  });

  it('loads and appends another page of commits', async () => {
    const user = userEvent.setup();
    const nextPage = deferred<BranchCommitPage>();
    const listBranchCommits = vi
      .spyOn(api, 'listBranchCommits')
      .mockResolvedValueOnce(
        branchCommitPageFactory.build({
          commits: [newest],
          total: 2,
          hasMore: true,
        }),
      )
      .mockReturnValueOnce(nextPage.promise);
    renderCommitHistoryCard();

    const showMoreButton = await screen.findByRole('button', {
      name: 'Show more',
    });
    expect(showMoreButton).toBeVisible();
    expect(showMoreButton).toBeEnabled();
    await user.click(showMoreButton);

    expect(listBranchCommits).toHaveBeenCalledTimes(2);
    expect(listBranchCommits).toHaveBeenNthCalledWith(2, {
      worktreeId,
      targetBranch,
      offset: 1,
      limit: 25,
    });
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

    nextPage.resolve(
      branchCommitPageFactory.build({
        commits: [earlier],
        total: 2,
        hasMore: false,
      }),
    );

    expect(await screen.findByText(earlier.title)).toBeVisible();
    expect(
      screen
        .getAllByRole('button', { name: /commit hash$/ })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([`Copy ${newest.hash} commit hash`, `Copy ${earlier.hash} commit hash`]);
    expect(screen.getByText('2 commits')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('reports a paging failure and allows another attempt', async () => {
    const user = userEvent.setup();
    const listBranchCommits = vi
      .spyOn(api, 'listBranchCommits')
      .mockResolvedValueOnce(
        branchCommitPageFactory.build({
          commits: [newest],
          total: 2,
          hasMore: true,
        }),
      )
      .mockRejectedValueOnce(new Error('could not load more commits'));
    const onError = vi.fn();
    renderCommitHistoryCard({ onError });

    const showMoreButton = await screen.findByRole('button', {
      name: 'Show more',
    });
    await user.click(showMoreButton);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('could not load more commits');
    expect(listBranchCommits).toHaveBeenCalledTimes(2);
    expect(listBranchCommits).toHaveBeenNthCalledWith(2, {
      worktreeId,
      targetBranch,
      offset: 1,
      limit: 25,
    });
    expect(screen.getByText(newest.title)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show more' })).toBeEnabled();
  });
});

describe('appendCommitPage', () => {
  it('appends the next page without disturbing newest-first ordering', () => {
    expect(
      appendCommitPage(
        {
          commits: [newest],
          total: 2,
          hasMore: true,
          loadingMore: true,
        },
        {
          commits: [earlier],
          total: 2,
          hasMore: false,
        },
      ),
    ).toEqual({
      commits: [newest, earlier],
      total: 2,
      hasMore: false,
      loadingMore: false,
    });
  });
});
