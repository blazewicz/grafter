// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommitDiffDetails } from '../../../src/renderer/diff/CommitDiffDetails';
import type { CommitDiffSession } from '../../../src/shared/contracts';
import { settingsFactory } from '../../factories';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';

const scenario = buildDiffViewerScenario();
const settings = settingsFactory.build();

function renderCommitDiffDetails(
  session: CommitDiffSession = scenario.commitSession,
): void {
  render(
    <CommitDiffDetails session={session} settings={settings} systemLocale="en-US" />,
  );
}

describe('CommitDiffDetails', () => {
  afterEach(cleanup);

  it('shows commit metadata and body without requiring an interaction', () => {
    const session = {
      ...scenario.commitSession,
      commit: {
        ...scenario.commitSession.commit,
        authoredAt: '2026-07-21T12:30:00',
      },
    };
    renderCommitDiffDetails(session);

    const details = screen.getByRole('region', { name: 'Commit details' });
    expect(details).toHaveTextContent('2026-07-21 at 12:30');
    expect(details).toHaveTextContent(session.commit.authorName);
    expect(details).toHaveTextContent(session.commit.body);
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
  ])('describes the $name comparison', ({ session, description }) => {
    renderCommitDiffDetails(session);

    expect(screen.getByRole('region', { name: 'Commit details' })).toHaveTextContent(
      description,
    );
  });

  it('shows the empty-body fallback for a root commit', () => {
    renderCommitDiffDetails(scenario.rootCommitSession);

    expect(screen.getByText('No additional commit message.')).toBeVisible();
  });
});
