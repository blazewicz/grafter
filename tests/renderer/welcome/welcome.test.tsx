// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Welcome } from '../../../src/renderer/welcome/Welcome';
import { buildWelcomeScenario } from '../../scenarios/welcome/welcome';

const scenario = buildWelcomeScenario();

describe('Welcome', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders ordered recent repositories with accessible open actions', () => {
    render(
      <Welcome
        homeDirectory={scenario.emptySnapshot.homeDirectory}
        recentRepositories={scenario.recentRepositories}
        busy={false}
        onOpenRepository={() => undefined}
        onOpenRecentRepository={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Open Repository...' })).toBeVisible();
    const recentButtons = scenario.recentRepositories.map((repository) =>
      screen.getByRole('button', {
        name: new RegExp(`^Open ${repository.name} repository at `),
      }),
    );
    const [newestButton, olderButton] = recentButtons;
    if (!newestButton || !olderButton) throw new Error('Expected two recent entries.');
    expect(newestButton).toAppearBefore(olderButton);
    expect(newestButton).toHaveTextContent('~/Code/newest.worktrees/feature');
  });

  it('opens the picker and recent entries with exact IDs', async () => {
    const user = userEvent.setup();
    const onOpenRepository = vi.fn();
    const onOpenRecentRepository = vi.fn();
    render(
      <Welcome
        homeDirectory={scenario.emptySnapshot.homeDirectory}
        recentRepositories={scenario.recentRepositories}
        busy={false}
        onOpenRepository={onOpenRepository}
        onOpenRecentRepository={onOpenRecentRepository}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open Repository...' }));
    const recent = scenario.recentRepositories[0];
    if (!recent) throw new Error('Expected a recent repository.');
    await user.click(
      screen.getByRole('button', {
        name: new RegExp(`^Open ${recent.name} repository at `),
      }),
    );

    expect(onOpenRepository).toHaveBeenCalledOnce();
    expect(onOpenRecentRepository).toHaveBeenCalledOnce();
    expect(onOpenRecentRepository).toHaveBeenCalledWith(recent.repositoryId);
  });
});
