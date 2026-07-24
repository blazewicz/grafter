import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BranchCommit } from '../../../../src/shared/contracts';
import {
  appendCommitPage,
  CommitHistoryCardContent,
  type CommitHistoryState,
} from '../../../../src/renderer/components/details/CommitHistoryCard';

const newest: BranchCommit = {
  hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  title: 'Newest change',
  authorName: 'Ada Lovelace',
  authoredAt: '2026-07-22T15:18:00+02:00',
};

const earlier: BranchCommit = {
  hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  title: 'Earlier change',
  authorName: 'Grace Hopper',
  authoredAt: '2026-07-21T09:30:00Z',
};

function renderHistory({
  history,
  failed = false,
  copiedText,
  opening = false,
}: {
  history?: CommitHistoryState;
  failed?: boolean;
  copiedText?: string;
  opening?: boolean;
} = {}): string {
  return renderToStaticMarkup(
    createElement(CommitHistoryCardContent, {
      history,
      failed,
      settings: { dateFormat: 'year-month-day', timeFormat: '24-hour' },
      systemLocale: 'en-GB',
      copiedText,
      opening,
      onCopy: () => undefined,
      onViewChanges: () => undefined,
      onLoadMore: () => undefined,
    }),
  );
}

describe('CommitHistoryCardContent rendering', () => {
  it('renders focused loading, failure, and empty states', () => {
    expect(renderHistory()).toContain('Loading commits');
    expect(renderHistory({ failed: true })).toContain('Could not load commits.');
    expect(
      renderHistory({
        history: { commits: [], total: 0, hasMore: false, loadingMore: false },
      }),
    ).toContain('No commits to merge.');
  });

  it('keeps newest commits first with compact metadata and row actions', () => {
    const html = renderHistory({
      history: {
        commits: [newest, earlier],
        total: 2,
        hasMore: true,
        loadingMore: false,
      },
      copiedText: earlier.hash,
    });

    expect(html).toContain('2 commits');
    expect(html.indexOf('Newest change')).toBeLessThan(html.indexOf('Earlier change'));
    expect(html).toContain(`<code title="${newest.hash}">bbbbbbb</code>`);
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('2026-07-22 at 15:18');
    expect(html).toContain(`aria-label="Copy ${newest.hash} commit hash"`);
    expect(html).toContain('aria-label="Commit hash copied"');
    expect(html).toContain('aria-label="View changes in bbbbbbb"');
    expect(html).toContain('aria-label="View changes in aaaaaaa"');
    expect(html).toContain('>Show more</button>');
  });

  it('disables paging and diff actions while their operations are active', () => {
    const html = renderHistory({
      history: {
        commits: [newest],
        total: 2,
        hasMore: true,
        loadingMore: true,
      },
      opening: true,
    });

    expect(html).toContain('disabled="" aria-label="View changes in bbbbbbb"');
    expect(html).toContain('disabled="">');
    expect(html).toContain('Loading…');
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
