// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/App';
import { api } from '../../src/renderer/grafter-api';
import type { AppSnapshot } from '../../src/shared/contracts';
import { buildWelcomeScenario } from '../scenarios/welcome/welcome';
import { deferred } from '../support/deferred';
import { appSnapshotFactory, projectFactory, worktreeFactory } from '../factories';

const scenario = buildWelcomeScenario();

function renderApp(snapshot: Promise<AppSnapshot>): void {
  vi.spyOn(api, 'getSnapshot').mockReturnValue(snapshot);
  vi.spyOn(api, 'onSnapshotUpdate').mockReturnValue(() => undefined);
  render(<App />);
}

describe('App welcome state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps transient loading distinct from the persistent empty welcome', async () => {
    const snapshot = deferred<AppSnapshot>();
    renderApp(snapshot.promise);

    expect(screen.getByRole('status', { name: 'Loading Grafter' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Welcome to Grafter' })).toBeNull();

    snapshot.resolve(scenario.emptySnapshot);

    expect(
      await screen.findByRole('heading', { name: 'Welcome to Grafter' }),
    ).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Loading Grafter' })).toBeNull();
  });

  it('opens a recent repository through its ID and enters the populated tree', async () => {
    const user = userEvent.setup();
    const recent = scenario.recentRepositories[0];
    if (!recent) throw new Error('Expected welcome scenario data.');
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
      await screen.findByRole('button', { name: 'Open Repository...' }),
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

  it('honors a window-manager linked-worktree selection handoff', async () => {
    const project = projectFactory.build();
    const linkedWorktree = worktreeFactory.build({
      projectId: project.id,
      path: `${project.path}.worktrees/selected-feature`,
      displayName: 'selected-feature',
    });
    const repository = { ...project, worktrees: [...project.worktrees, linkedWorktree] };
    const selectedSnapshot = appSnapshotFactory.build(
      {
        selectedWorktreeId: linkedWorktree.id,
        worktreeSelectionRequestId: 1,
      },
      { associations: { projects: [repository] } },
    );
    const getWorktreeDetails = vi
      .spyOn(api, 'getWorktreeDetails')
      .mockReturnValue(new Promise(() => undefined));
    vi.spyOn(api, 'getWorktreeStatus').mockReturnValue(new Promise(() => undefined));
    vi.spyOn(api, 'getCommandLog').mockResolvedValue([]);

    renderApp(Promise.resolve(selectedSnapshot));

    await waitFor(() => {
      expect(getWorktreeDetails).toHaveBeenCalledWith(linkedWorktree.id);
    });
  });
});
