// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PullRequestCard } from '../../../../src/renderer/components/details/PullRequestCard';
import { api } from '../../../../src/renderer/grafter-api';
import type { PullRequest, PullRequestState } from '../../../../src/shared/contracts';

const pullRequest: PullRequest = {
  number: 18,
  title: 'State-aware pull request',
  url: 'https://github.com/example/repo/pull/18',
  state: 'OPEN',
  baseBranch: 'main',
};

function renderPullRequestCard(
  nextPullRequest: PullRequest = pullRequest,
  onError: (message: string) => void = () => undefined,
): void {
  render(
    <PullRequestCard
      pullRequest={nextPullRequest}
      animatePullRequestDiscovery={false}
      onError={onError}
    />,
  );
}

describe('PullRequestCard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    { state: 'OPEN', label: 'open', title: 'Status: Open' },
    { state: 'DRAFT', label: 'draft', title: 'Status: Draft' },
    { state: 'MERGED', label: 'merged', title: 'Status: Merged' },
    { state: 'CLOSED', label: 'closed', title: 'Status: Closed' },
  ] satisfies {
    state: PullRequestState;
    label: string;
    title: string;
  }[])('shows the $state pull request status', ({ state, label, title }) => {
    renderPullRequestCard({ ...pullRequest, state });

    const status = screen.getByRole('img', {
      name: `Pull request status: ${label}`,
    });
    expect(status).toBeVisible();
    expect(status).toHaveAttribute('title', title);
  });

  it('shows the pull request title, number, and open action', () => {
    renderPullRequestCard();

    expect(screen.getByLabelText(`Pull request #${pullRequest.number}`)).toBeVisible();
    expect(screen.getByText(pullRequest.title)).toBeVisible();
    expect(screen.getByText(`#${pullRequest.number}`)).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: `Open pull request #${pullRequest.number}: ${pullRequest.title}`,
      }),
    ).toHaveAttribute('title', 'Open pull request on GitHub');
  });

  it('opens the pull request in the browser', async () => {
    const user = userEvent.setup();
    const openExternal = vi.spyOn(api, 'openExternal').mockResolvedValue(undefined);
    renderPullRequestCard();

    const openButton = screen.getByRole('button', {
      name: `Open pull request #${pullRequest.number}: ${pullRequest.title}`,
    });
    expect(openButton).toBeVisible();
    await user.click(openButton);

    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(pullRequest.url);
  });

  it('reports a failure to open the pull request', async () => {
    const user = userEvent.setup();
    const openExternal = vi
      .spyOn(api, 'openExternal')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:open-external': Error: failed"),
      );
    const onError = vi.fn();
    renderPullRequestCard(pullRequest, onError);

    await user.click(
      screen.getByRole('button', {
        name: `Open pull request #${pullRequest.number}: ${pullRequest.title}`,
      }),
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('failed');
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(pullRequest.url);
  });
});
