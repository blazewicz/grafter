// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/App';
import { api } from '../../src/renderer/grafter-api';
import type { AppSnapshot, RepositoryWindowSnapshot } from '../../src/shared/contracts';
import { buildWelcomeScenario } from '../scenarios/welcome/welcome';
import { buildNewWorktreeScenario } from '../scenarios/sidebar/new-worktree';
import { buildRepositoryWindowScenario } from '../scenarios/sidebar/repository-window';
import { deferred } from '../support/deferred';
import {
  repositorySnapshotFactory,
  approvalRequestFactory,
  projectFactory,
  worktreeDetailsFactory,
  worktreeFactory,
} from '../factories';

const scenario = buildWelcomeScenario();
const repositoryScenario = buildRepositoryWindowScenario();
const newWorktreeScenario = buildNewWorktreeScenario();

function renderApp(snapshot: Promise<AppSnapshot>): void {
  vi.spyOn(api, 'getSnapshot').mockReturnValue(snapshot);
  vi.spyOn(api, 'onSnapshotUpdate').mockReturnValue(() => undefined);
  render(<App />);
}

function stubRepositoryWindowApis(snapshot: RepositoryWindowSnapshot) {
  const refresh = vi.spyOn(api, 'refresh').mockResolvedValue(snapshot);
  vi.spyOn(api, 'getCommandLog').mockResolvedValue([]);
  vi.spyOn(api, 'getWorktreeStatus').mockResolvedValue('clean');
  const getWorktreeDetails = vi
    .spyOn(api, 'getWorktreeDetails')
    .mockImplementation((worktreeId) => {
      const project = snapshot.repository;
      const worktree = project.worktrees.find((candidate) => candidate.id === worktreeId);
      if (worktree) {
        return Promise.resolve(
          worktreeDetailsFactory.build({}, { transient: { project, worktree } }),
        );
      }
      return Promise.reject(new Error('Worktree not found.'));
    });
  return { refresh, getWorktreeDetails };
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

  it('honors a window-manager linked-worktree selection handoff', async () => {
    const project = projectFactory.build();
    const linkedWorktree = worktreeFactory.build({
      projectId: project.id,
      path: `${project.path}.worktrees/selected-feature`,
      displayName: 'selected-feature',
    });
    const repository = { ...project, worktrees: [...project.worktrees, linkedWorktree] };
    const selectedSnapshot = repositorySnapshotFactory.build(
      {
        selectedWorktreeId: linkedWorktree.id,
        worktreeSelectionRequestId: 1,
      },
      { associations: { repository } },
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

  it('renders only the owning repository and refreshes only its worktrees', async () => {
    const { refresh } = stubRepositoryWindowApis(repositoryScenario.snapshot);
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    const worktreeList = await screen.findByLabelText(
      `${repositoryScenario.repository.name} worktrees`,
    );
    const mainButton = within(worktreeList).getByRole('button', {
      name: `Main worktree, checked out branch ${repositoryScenario.mainWorktree.branch}`,
    });
    const linkedButton = within(worktreeList).getByRole('button', {
      name: `${repositoryScenario.linkedWorktree.displayName}, checked out branch ${repositoryScenario.linkedWorktree.branch}`,
    });

    expect(mainButton).toAppearBefore(linkedButton);
    expect(
      screen.getByRole('button', {
        name: `${repositoryScenario.repository.name} repository details`,
      }),
    ).toBeVisible();
    expect(screen.queryByText(repositoryScenario.secondRepository.name)).toBeNull();
    expect(
      screen.queryByLabelText(`${repositoryScenario.secondRepository.name} worktrees`),
    ).toBeNull();
    expect(screen.queryByTitle('Remove from Grafter')).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: `Expand ${repositoryScenario.repository.name}`,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: `Collapse ${repositoryScenario.repository.name}`,
      }),
    ).toBeNull();
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith();
    });
  });

  it('navigates between worktree and repository details with back and forward', async () => {
    const user = userEvent.setup();
    const { getWorktreeDetails } = stubRepositoryWindowApis(repositoryScenario.snapshot);
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    await waitFor(() => {
      expect(getWorktreeDetails).toHaveBeenCalledWith(
        repositoryScenario.linkedWorktree.id,
      );
    });
    await user.click(
      screen.getByRole('button', {
        name: `${repositoryScenario.repository.name} repository details`,
      }),
    );

    expect(await screen.findByRole('region', { name: 'Worktrees' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(getWorktreeDetails).toHaveBeenCalledTimes(2);
    });
    expect(getWorktreeDetails).toHaveBeenLastCalledWith(
      repositoryScenario.linkedWorktree.id,
    );

    expect(screen.getByRole('button', { name: 'Forward' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Forward' }));
    expect(await screen.findByRole('region', { name: 'Worktrees' })).toBeVisible();
  });

  it('reconciles selection when the repository snapshot identity changes', async () => {
    const first = repositoryScenario.snapshot;
    const secondRepository = projectFactory.build();
    const second = repositorySnapshotFactory.build(
      {},
      { associations: { repository: secondRepository } },
    );
    let publishSnapshot: ((snapshot: AppSnapshot) => void) | undefined;
    vi.spyOn(api, 'getSnapshot').mockResolvedValue(first);
    vi.spyOn(api, 'onSnapshotUpdate').mockImplementation((listener) => {
      publishSnapshot = listener;
      return () => undefined;
    });
    vi.spyOn(api, 'refresh').mockResolvedValue(first);
    vi.spyOn(api, 'getCommandLog').mockResolvedValue([]);
    vi.spyOn(api, 'getWorktreeStatus').mockResolvedValue('clean');
    const getWorktreeDetails = vi
      .spyOn(api, 'getWorktreeDetails')
      .mockImplementation((worktreeId) => {
        const project = worktreeId.startsWith(`${first.repository.id}:`)
          ? first.repository
          : second.repository;
        const worktree = project.worktrees.find(
          (candidate) => candidate.id === worktreeId,
        );
        if (!worktree) return Promise.reject(new Error('Worktree not found.'));
        return Promise.resolve(
          worktreeDetailsFactory.build({}, { transient: { project, worktree } }),
        );
      });
    render(<App />);

    expect(
      await screen.findByRole('button', {
        name: `${first.repository.name} repository details`,
      }),
    ).toBeVisible();
    if (!publishSnapshot) throw new Error('Expected a snapshot subscription.');
    const publish = publishSnapshot;
    act(() => publish(second));

    expect(
      await screen.findByRole('button', {
        name: `${second.repository.name} repository details`,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: `${first.repository.name} repository details`,
      }),
    ).toBeNull();
    await waitFor(() => {
      expect(getWorktreeDetails).toHaveBeenLastCalledWith(
        second.repository.worktrees[0]?.id,
      );
    });
  });

  it('selects a created worktree and queues its setup approval', async () => {
    const user = userEvent.setup();
    const project = newWorktreeScenario.project;
    const createdWorktree = worktreeFactory.build({
      projectId: project.id,
      path: newWorktreeScenario.suggestedPath,
      branch: newWorktreeScenario.availableBranch,
      displayName: newWorktreeScenario.availableBranch.replaceAll('/', '-'),
    });
    const openedProject = {
      ...project,
      worktrees: [...project.worktrees, createdWorktree],
    };
    const openedSnapshot = repositorySnapshotFactory.build(
      {},
      { associations: { repository: openedProject } },
    );
    const initialSnapshot = repositorySnapshotFactory.build(
      {},
      { associations: { repository: project } },
    );
    const approval = approvalRequestFactory.build();
    const { refresh } = stubRepositoryWindowApis(openedSnapshot);
    refresh.mockResolvedValue(initialSnapshot);
    vi.spyOn(api, 'listBranches').mockResolvedValue(newWorktreeScenario.branches);
    vi.spyOn(api, 'suggestWorktreePath').mockResolvedValue(
      newWorktreeScenario.suggestedPath,
    );
    const createWorktree = vi.spyOn(api, 'createWorktree').mockResolvedValue({
      snapshot: openedSnapshot,
      setupApproval: approval,
    });
    renderApp(Promise.resolve(initialSnapshot));

    await user.click(
      await screen.findByRole('button', { name: `Add worktree to ${project.name}` }),
    );
    await user.click(
      await screen.findByRole('button', { name: newWorktreeScenario.availableBranch }),
    );
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Path' })).toHaveValue(
        newWorktreeScenario.suggestedPath,
      );
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createWorktree).toHaveBeenCalledOnce();
    });
    expect(createWorktree).toHaveBeenCalledWith({
      branch: newWorktreeScenario.availableBranch,
      path: newWorktreeScenario.suggestedPath,
    });
    expect(await screen.findByRole('dialog', { name: 'Review command' })).toBeVisible();
    expect(screen.getByText(approval.warning)).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: `${createdWorktree.displayName}, checked out branch ${createdWorktree.branch}`,
      }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

/*
  it('opens the new-worktree dialog with Command-N', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    renderSidebar();

    await user.keyboard('{Meta>}n{/Meta}');

    expect(screen.getByRole('dialog', { name: 'New worktree' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Filter branches' })).toHaveFocus();
  });

  it('keeps the dialog open when Command-N is pressed while it is already open', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    renderSidebar();

    await user.keyboard('{Meta>}n{/Meta}');
    await user.keyboard('{Meta>}n{/Meta}');

    expect(screen.getByRole('dialog', { name: 'New worktree' })).toBeVisible();
  });

  it('closes the dialog on Escape and restores focus to the add button', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    renderSidebar();

    await user.keyboard('{Meta>}n{/Meta}');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'New worktree' })).toBeNull();
    expect(
      screen.getByRole('button', {
        name: `Add worktree to ${scenario.repository.name}`,
      }),
    ).toHaveFocus();
  });
*/
