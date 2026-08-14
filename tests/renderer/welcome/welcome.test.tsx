// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Welcome } from '../../../src/renderer/welcome/Welcome';
import type { RecentRepository } from '../../../src/shared/contracts';
import { buildWelcomeScenario } from '../../scenarios/welcome/welcome';

const scenario = buildWelcomeScenario();

function renderWelcome(
  options: {
    homeDirectory?: string;
    recentRepositories?: readonly RecentRepository[];
    busy?: boolean;
    onOpenRepository?: () => void;
    onOpenRecentRepository?: (repositoryId: string) => void;
  } = {},
): void {
  render(
    <Welcome
      homeDirectory={options.homeDirectory ?? scenario.emptySnapshot.homeDirectory}
      recentRepositories={options.recentRepositories ?? scenario.recentRepositories}
      busy={options.busy ?? false}
      onOpenRepository={options.onOpenRepository ?? (() => undefined)}
      onOpenRecentRepository={options.onOpenRecentRepository ?? (() => undefined)}
    />,
  );
}

describe('Welcome', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders ordered recent repositories with accessible open actions', () => {
    renderWelcome();

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
    renderWelcome({ onOpenRepository, onOpenRecentRepository });

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

  it('disables all open actions when busy', () => {
    renderWelcome({ busy: true });

    expect(screen.getByRole('button', { name: 'Open Repository...' })).toBeDisabled();
    for (const repository of scenario.recentRepositories) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(`^Open ${repository.name} repository at `),
        }),
      ).toBeDisabled();
    }
  });
});
