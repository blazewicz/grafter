import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  openPullRequestLink,
  PullRequestCard,
} from '../../../../src/renderer/components/details/PullRequestCard';
import { api } from '../../../../src/renderer/grafter-api';

describe('PullRequestCard', () => {
  it.each([
    ['OPEN', 'Open', 'lucide-git-pull-request'],
    ['DRAFT', 'Draft', 'lucide-git-pull-request-draft'],
    ['MERGED', 'Merged', 'lucide-git-merge'],
    ['CLOSED', 'Closed', 'lucide-git-pull-request-closed'],
  ] as const)('renders the %s state icon', (state, label, iconClass) => {
    const html = renderToStaticMarkup(
      createElement(PullRequestCard, {
        pullRequest: {
          number: 18,
          title: 'State-aware pull request',
          url: 'https://github.com/example/repo/pull/18',
          state,
          baseBranch: 'main',
        },
        animatePullRequestDiscovery: false,
        onError: () => undefined,
      }),
    );

    expect(html).toContain(`aria-label="Pull request status: ${label.toLowerCase()}"`);
    expect(html).toContain(`data-state="${state}"`);
    expect(html).toContain(iconClass);
  });

  it('reports link failures through the shared error UI', async () => {
    const openExternal = vi
      .spyOn(api, 'openExternal')
      .mockRejectedValueOnce(new Error('Browser unavailable'));
    const onError = vi.fn();

    openPullRequestLink('https://github.com/example/repo/pull/42', onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('Browser unavailable'));

    expect(openExternal).toHaveBeenCalledWith('https://github.com/example/repo/pull/42');
    openExternal.mockRestore();
  });
});
