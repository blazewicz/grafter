// @vitest-environment happy-dom

import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
import type { RepositoryWindowSnapshot } from '../../../src/shared/contracts';
import { buildRepositoryWindowScenario } from '../../scenarios/sidebar/repository-window';
import { buildWelcomeScenario } from '../../scenarios/welcome/welcome';
import { deferred } from '../../support/deferred';
import { renderApp, stubRepositoryWindowApis } from './app-test-support';

const scenario = buildWelcomeScenario();
const repositoryScenario = buildRepositoryWindowScenario();

describe('App welcome state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens a recent repository through its ID and enters the populated tree', async () => {
    const user = userEvent.setup();
    const recent = scenario.recentRepositories[0];
    if (!recent) throw new Error('Expected welcome scenario data.');
    stubRepositoryWindowApis(scenario.openedSnapshot);
    const openRecentRepository = vi
      .spyOn(api, 'openRecentRepository')
      .mockResolvedValue(scenario.openedSnapshot);
    renderApp(Promise.resolve(scenario.emptySnapshot));

    const recentButton = await screen.findByRole('button', {
      name: new RegExp(`^Open ${recent.name} repository at `),
    });
    expect(openRecentRepository).not.toHaveBeenCalled();
    await user.click(recentButton);

    expect(openRecentRepository).toHaveBeenCalledOnce();
    expect(openRecentRepository).toHaveBeenCalledWith(recent.repositoryId);
    expect(
      await screen.findByRole('button', { name: 'Worktree list options' }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Welcome to Grafter' })).toBeNull();
  });

  it('keeps the welcome usable and shows existing error feedback after a recent fails', async () => {
    const user = userEvent.setup();
    const recent = scenario.recentRepositories[0];
    if (!recent) throw new Error('Expected a recent repository.');
    vi.spyOn(api, 'openRecentRepository').mockRejectedValue(
      new Error('The recent repository is no longer available.'),
    );
    renderApp(Promise.resolve(scenario.emptySnapshot));

    await user.click(
      await screen.findByRole('button', {
        name: new RegExp(`^Open ${recent.name} repository at `),
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('The recent repository is no longer available.'),
      ).toBeVisible();
    });
    expect(screen.getByRole('heading', { name: 'Welcome to Grafter' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Repository...' })).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: new RegExp(`^Open ${recent.name} repository at `),
      }),
    ).toBeEnabled();
  });

  it('opens a repository from the picker and applies the returned snapshot', async () => {
    const user = userEvent.setup();
    stubRepositoryWindowApis(repositoryScenario.snapshot);
    const chooseRepository = vi
      .spyOn(api, 'chooseRepository')
      .mockResolvedValue(repositoryScenario.snapshot);
    renderApp(Promise.resolve(scenario.emptySnapshot));

    await user.click(await screen.findByRole('button', { name: 'Open Repository...' }));

    expect(chooseRepository).toHaveBeenCalledOnce();
    expect(
      await screen.findByLabelText(`${repositoryScenario.repository.name} worktrees`),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Welcome to Grafter' })).toBeNull();
  });

  it('stays on the welcome when the repository picker is cancelled', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'chooseRepository').mockResolvedValue(null);
    renderApp(Promise.resolve(scenario.emptySnapshot));

    await user.click(await screen.findByRole('button', { name: 'Open Repository...' }));

    expect(
      await screen.findByRole('heading', { name: 'Welcome to Grafter' }),
    ).toBeVisible();
  });

  it('reports and recovers when the repository picker fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'chooseRepository').mockRejectedValue(
      new Error('The repository picker could not open a window.'),
    );
    renderApp(Promise.resolve(scenario.emptySnapshot));

    await user.click(await screen.findByRole('button', { name: 'Open Repository...' }));

    await waitFor(() => {
      expect(
        screen.getByText('The repository picker could not open a window.'),
      ).toBeVisible();
    });
    expect(screen.getByRole('button', { name: 'Open Repository...' })).toBeEnabled();
  });

  it('disables the welcome actions while a repository is opening', async () => {
    const user = userEvent.setup();
    const opening = deferred<RepositoryWindowSnapshot>();
    const recent = scenario.recentRepositories[0];
    if (!recent) throw new Error('Expected a recent repository.');
    stubRepositoryWindowApis(repositoryScenario.snapshot);
    vi.spyOn(api, 'chooseRepository').mockReturnValue(opening.promise);
    renderApp(Promise.resolve(scenario.emptySnapshot));

    await user.click(await screen.findByRole('button', { name: 'Open Repository...' }));

    expect(screen.getByRole('button', { name: 'Open Repository...' })).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: new RegExp(`^Open ${recent.name} repository at `),
      }),
    ).toBeDisabled();

    opening.resolve(repositoryScenario.snapshot);

    expect(
      await screen.findByLabelText(`${repositoryScenario.repository.name} worktrees`),
    ).toBeVisible();
  });
});
