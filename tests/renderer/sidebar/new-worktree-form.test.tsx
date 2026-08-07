// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewWorktreeForm } from '../../../src/renderer/sidebar/NewWorktreeForm';
import { api } from '../../../src/renderer/grafter-api';
import type { GrafterApi } from '../../../src/shared/contracts';
import { buildNewWorktreeScenario } from '../../scenarios/sidebar/new-worktree';
import { deferred } from '../../support/deferred';

const scenario = buildNewWorktreeScenario();

function renderNewWorktreeForm(
  onCancel: () => void = () => undefined,
  onCreated: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void = () => undefined,
  onError: (message: string) => void = () => undefined,
): void {
  render(
    <NewWorktreeForm
      project={scenario.project}
      onCancel={onCancel}
      onCreated={onCreated}
      onError={onError}
    />,
  );
}

describe('NewWorktreeForm', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads available branches and cancels creation', async () => {
    const user = userEvent.setup();
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockResolvedValue(scenario.branches);
    const onCancel = vi.fn();
    renderNewWorktreeForm(onCancel);

    expect(screen.getByText('Loading branches…')).toBeVisible();
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith();
    expect(
      await screen.findByRole('button', { name: scenario.availableBranch }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: `${scenario.checkedOutBranch}: Already checked out in main`,
      }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('selects a branch, edits its suggested path, and creates the worktree', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches);
    const suggestWorktreePath = vi
      .spyOn(api, 'suggestWorktreePath')
      .mockResolvedValue(scenario.suggestedPath);
    const createResult = deferred<typeof scenario.createdResult>();
    const createWorktree = vi
      .spyOn(api, 'createWorktree')
      .mockReturnValue(createResult.promise);
    const onCreated = vi.fn();
    renderNewWorktreeForm(undefined, onCreated);

    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();
    await user.click(
      await screen.findByRole('button', { name: scenario.availableBranch }),
    );

    expect(suggestWorktreePath).toHaveBeenCalledOnce();
    expect(suggestWorktreePath).toHaveBeenCalledWith(scenario.availableBranch);
    const pathInput = await screen.findByRole('textbox', { name: 'Path' });
    await waitFor(() => {
      expect(pathInput).toHaveValue(scenario.suggestedPath);
    });
    await user.clear(pathInput);
    await user.type(pathInput, scenario.editedPath);
    await user.click(createButton);

    expect(createWorktree).toHaveBeenCalledOnce();
    expect(createWorktree).toHaveBeenCalledWith({
      branch: scenario.availableBranch,
      path: scenario.editedPath,
    });
    expect(createButton).toBeDisabled();

    createResult.resolve(scenario.createdResult);

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledOnce();
    });
    expect(onCreated).toHaveBeenCalledWith(scenario.createdResult, {
      path: scenario.editedPath,
    });
    expect(createButton).toBeEnabled();
  });

  it('clears the chosen branch and path when the branch filter changes', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches);
    vi.spyOn(api, 'suggestWorktreePath').mockResolvedValue(scenario.suggestedPath);
    renderNewWorktreeForm();

    await user.click(
      await screen.findByRole('button', { name: scenario.availableBranch }),
    );
    expect(await screen.findByRole('textbox', { name: 'Path' })).toHaveValue(
      scenario.suggestedPath,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Filter branches' }),
      'different',
    );

    expect(screen.queryByRole('textbox', { name: 'Path' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('reports path-suggestion and creation failures', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches);
    const suggestWorktreePath = vi
      .spyOn(api, 'suggestWorktreePath')
      .mockRejectedValueOnce(new Error('could not suggest a path'))
      .mockResolvedValueOnce(scenario.suggestedPath);
    const createWorktree = vi
      .spyOn(api, 'createWorktree')
      .mockRejectedValue(new Error('could not create the worktree'));
    const onError = vi.fn();
    renderNewWorktreeForm(undefined, undefined, onError);

    const branchButton = await screen.findByRole('button', {
      name: scenario.availableBranch,
    });
    await user.click(branchButton);
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('could not suggest a path');
    });

    await user.click(branchButton);
    const pathInput = await screen.findByRole('textbox', { name: 'Path' });
    await waitFor(() => {
      expect(pathInput).toHaveValue(scenario.suggestedPath);
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(2);
    });
    expect(onError).toHaveBeenNthCalledWith(2, 'could not create the worktree');
    expect(suggestWorktreePath).toHaveBeenCalledTimes(2);
    expect(createWorktree).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  it('reports a branch-loading failure', async () => {
    const listBranches = vi
      .spyOn(api, 'listBranches')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:list-branches': Error: failed"),
      );
    const onError = vi.fn();
    renderNewWorktreeForm(undefined, undefined, onError);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('failed');
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith();
    expect(screen.getByText('No matching branches')).toBeVisible();
  });
});
