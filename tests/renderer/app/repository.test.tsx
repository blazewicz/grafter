// @vitest-environment happy-dom

import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
import {
  approvalRequestFactory,
  branchDiffSessionFactory,
  diffStatsFactory,
  projectFactory,
  repositorySnapshotFactory,
  worktreeDetailsFactory,
  worktreeFactory,
} from '../../factories';
import { buildNewWorktreeScenario } from '../../scenarios/sidebar/new-worktree';
import { buildRepositoryWindowScenario } from '../../scenarios/sidebar/repository-window';
import { buildWelcomeScenario } from '../../scenarios/welcome/welcome';
import { installDiffViewerObservers } from '../diff/diff-viewer-test-harness';
import { renderApp, stubRepositoryWindowApis } from './app-test-support';

const repositoryScenario = buildRepositoryWindowScenario();
const newWorktreeScenario = buildNewWorktreeScenario();
const welcomeScenario = buildWelcomeScenario();

describe('App repository state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders only the owning repository and refreshes only its worktrees', async () => {
    const { refresh } = stubRepositoryWindowApis(repositoryScenario.snapshot);
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    const worktreeList = await screen.findByLabelText(
      `${repositoryScenario.repository.name} worktrees`,
    );
    const mainButton = within(worktreeList).getByRole('option', {
      name: `Main worktree, checked out branch ${repositoryScenario.mainWorktree.branch}`,
    });
    const linkedButton = within(worktreeList).getByRole('option', {
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
    const publish = renderApp(first);
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

    expect(
      await screen.findByRole('button', {
        name: `${first.repository.name} repository details`,
      }),
    ).toBeVisible();
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
    vi.spyOn(api, 'refresh').mockResolvedValue(selectedSnapshot);

    renderApp(Promise.resolve(selectedSnapshot));

    await waitFor(() => {
      expect(getWorktreeDetails).toHaveBeenCalledWith(linkedWorktree.id);
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
      screen.getByRole('option', {
        name: `${createdWorktree.displayName}, checked out branch ${createdWorktree.branch}`,
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('opens the new-worktree dialog with Command-N', async () => {
    const user = userEvent.setup();
    stubRepositoryWindowApis(repositoryScenario.snapshot);
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    await screen.findByRole('button', {
      name: `${repositoryScenario.repository.name} repository details`,
    });
    await user.keyboard('{Meta>}n{/Meta}');

    expect(screen.getByRole('dialog', { name: 'New worktree' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Filter branches' })).toHaveFocus();
  });

  it('keeps the dialog open when Command-N is pressed while it is already open', async () => {
    const user = userEvent.setup();
    stubRepositoryWindowApis(repositoryScenario.snapshot);
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    await screen.findByRole('button', {
      name: `${repositoryScenario.repository.name} repository details`,
    });
    await user.keyboard('{Meta>}n{/Meta}');
    await user.keyboard('{Meta>}n{/Meta}');

    expect(screen.getByRole('dialog', { name: 'New worktree' })).toBeVisible();
  });

  it('closes the new-worktree dialog with Escape', async () => {
    const user = userEvent.setup();
    stubRepositoryWindowApis(repositoryScenario.snapshot);
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    await screen.findByRole('button', {
      name: `${repositoryScenario.repository.name} repository details`,
    });
    await user.keyboard('{Meta>}n{/Meta}');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'New worktree' })).toBeNull();
  });

  it('ignores Command-N outside the repository window', async () => {
    const user = userEvent.setup();
    renderApp(Promise.resolve(welcomeScenario.emptySnapshot));

    await screen.findByRole('heading', { name: 'Welcome to Grafter' });
    await user.keyboard('{Meta>}n{/Meta}');

    expect(screen.queryByRole('dialog', { name: 'New worktree' })).toBeNull();
  });

  it('opens settings from the sidebar and saves the persisted settings', async () => {
    const user = userEvent.setup();
    const snapshot = repositoryScenario.snapshot;
    stubRepositoryWindowApis(snapshot);
    const updateSettings = vi.spyOn(api, 'updateSettings').mockResolvedValue(snapshot);
    renderApp(Promise.resolve(snapshot));

    await user.click(await screen.findByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute(
      'aria-modal',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(updateSettings).toHaveBeenCalledOnce();
    expect(updateSettings).toHaveBeenCalledWith({
      defaultWorktreePath: snapshot.settings.defaultWorktreePath,
      dateFormat: snapshot.settings.dateFormat,
      timeFormat: snapshot.settings.timeFormat,
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    });
  });

  it('keeps the settings dialog open when saving fails', async () => {
    const user = userEvent.setup();
    stubRepositoryWindowApis(repositoryScenario.snapshot);
    vi.spyOn(api, 'updateSettings').mockRejectedValue(
      new Error('Settings could not be written.'),
    );
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(screen.getByText('Settings could not be written.')).toBeVisible();
    });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  });

  it('removes a worktree only after the exact command is approved', async () => {
    const user = userEvent.setup();
    const approval = approvalRequestFactory.build();
    const prepareRemoveWorktree = vi
      .spyOn(api, 'prepareRemoveWorktree')
      .mockResolvedValue(approval);
    const approveCommand = vi
      .spyOn(api, 'approveCommand')
      .mockResolvedValue(repositoryScenario.snapshot);
    stubRepositoryWindowApis(repositoryScenario.snapshot);
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    await user.click(
      await screen.findByRole('button', {
        name: `Remove ${repositoryScenario.linkedWorktree.displayName} worktree`,
      }),
    );

    expect(prepareRemoveWorktree).toHaveBeenCalledOnce();
    expect(prepareRemoveWorktree).toHaveBeenCalledWith(
      repositoryScenario.linkedWorktree.id,
    );
    expect(await screen.findByRole('dialog', { name: 'Review command' })).toBeVisible();
    expect(screen.getByText(approval.warning)).toBeVisible();
    expect(screen.getByText(approval.command.displayCommand)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Approve & run' }));

    await waitFor(() => {
      expect(approveCommand).toHaveBeenCalledOnce();
    });
    expect(approveCommand).toHaveBeenCalledWith(approval.approvalId);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Review command' })).toBeNull();
    });
  });

  it('closes the approval dialog when the command is rejected', async () => {
    const user = userEvent.setup();
    const approval = approvalRequestFactory.build();
    vi.spyOn(api, 'prepareRemoveWorktree').mockResolvedValue(approval);
    const rejectCommand = vi
      .spyOn(api, 'rejectCommand')
      .mockResolvedValue(repositoryScenario.snapshot);
    stubRepositoryWindowApis(repositoryScenario.snapshot);
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    await user.click(
      await screen.findByRole('button', {
        name: `Remove ${repositoryScenario.linkedWorktree.displayName} worktree`,
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Don’t run' }));

    await waitFor(() => {
      expect(rejectCommand).toHaveBeenCalledOnce();
    });
    expect(rejectCommand).toHaveBeenCalledWith(approval.approvalId);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Review command' })).toBeNull();
    });
  });

  it('scopes command logs to the selection and toggles the audit panel', async () => {
    const user = userEvent.setup();
    const { getCommandLog } = stubRepositoryWindowApis(repositoryScenario.snapshot);
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    await waitFor(() => {
      expect(getCommandLog).toHaveBeenCalledWith({
        kind: 'worktree',
        worktreeId: repositoryScenario.linkedWorktree.id,
      });
    });

    await user.click(screen.getByRole('button', { name: 'Expand command log' }));
    expect(screen.getByRole('region', { name: 'Command history' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Collapse command log' }));
    expect(screen.queryByRole('region', { name: 'Command history' })).toBeNull();

    await user.click(
      screen.getByRole('button', {
        name: `${repositoryScenario.repository.name} repository details`,
      }),
    );
    await waitFor(() => {
      expect(getCommandLog).toHaveBeenLastCalledWith({ kind: 'repository' });
    });
  });

  it('surfaces refresh failures through the error toast', async () => {
    const user = userEvent.setup();
    const { refresh } = stubRepositoryWindowApis(repositoryScenario.snapshot);
    refresh.mockRejectedValue(new Error('The repository could not be refreshed.'));
    renderApp(Promise.resolve(repositoryScenario.snapshot));

    await waitFor(() => {
      expect(screen.getByText('The repository could not be refreshed.')).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(screen.queryByText('The repository could not be refreshed.')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Refresh repository' }));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(2);
    });
  });

  it('opens and closes the branch diff for the selected worktree', async () => {
    const user = userEvent.setup();
    const intersectionObservers = installDiffViewerObservers();
    try {
      const { getWorktreeDetails } = stubRepositoryWindowApis(
        repositoryScenario.snapshot,
      );
      const details = worktreeDetailsFactory.build(
        {
          targetBranch: repositoryScenario.mainWorktree.branch,
          diffStats: diffStatsFactory.build(),
        },
        {
          transient: {
            project: repositoryScenario.repository,
            worktree: repositoryScenario.linkedWorktree,
          },
        },
      );
      getWorktreeDetails.mockResolvedValue(details);
      const session = branchDiffSessionFactory.build({
        projectId: repositoryScenario.repository.id,
        branch: repositoryScenario.linkedWorktree.branch,
        targetBranch: repositoryScenario.mainWorktree.branch,
      });
      const openDiff = vi.spyOn(api, 'openDiff').mockResolvedValue(session);
      const closeDiff = vi.spyOn(api, 'closeDiff').mockResolvedValue(undefined);
      renderApp(Promise.resolve(repositoryScenario.snapshot));

      await user.click(await screen.findByRole('button', { name: 'View branch diff' }));

      expect(openDiff).toHaveBeenCalledOnce();
      expect(openDiff).toHaveBeenCalledWith(repositoryScenario.linkedWorktree.id);
      const dialog = await screen.findByRole('dialog', {
        name: `Committed changes from ${session.branch} against ${session.targetBranch}`,
      });
      expect(dialog).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Close diff viewer' }));

      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', {
            name: `Committed changes from ${session.branch} against ${session.targetBranch}`,
          }),
        ).toBeNull();
      });
      expect(closeDiff).toHaveBeenCalledWith(session.id);
    } finally {
      intersectionObservers.reset();
      vi.unstubAllGlobals();
    }
  });
});
