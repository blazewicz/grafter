// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
import { WorktreeList } from '../../../src/renderer/sidebar/WorktreeList';
import type { GrafterApi, Project, Worktree } from '../../../src/shared/contracts';
import { buildNewWorktreeScenario } from '../../scenarios/sidebar/new-worktree';
import { buildRepositoryWorktreesScenario } from '../../scenarios/sidebar/repository-worktrees';

const scenario = buildRepositoryWorktreesScenario();
const newWorktreeScenario = buildNewWorktreeScenario();

interface RenderWorktreeListOptions {
  project?: Project;
  selectedId?: string;
  adding?: boolean;
  onSelect?: (id: string) => void;
  onCancelAdd?: () => void;
  onCreated?: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveWorktree?: (worktree: Worktree) => void;
  onError?: (message: string) => void;
}

function renderWorktreeList(options: RenderWorktreeListOptions = {}): void {
  render(
    <WorktreeList
      homeDirectory={scenario.homeDirectory}
      project={options.project ?? scenario.repository}
      selectedId={options.selectedId}
      adding={options.adding ?? false}
      onSelect={options.onSelect ?? (() => undefined)}
      onCancelAdd={options.onCancelAdd ?? (() => undefined)}
      onCreated={options.onCreated ?? (() => undefined)}
      onRemoveWorktree={options.onRemoveWorktree ?? (() => undefined)}
      onError={options.onError ?? (() => undefined)}
    />,
  );
}

function worktreeButton(worktree: Worktree): HTMLButtonElement {
  return screen.getByRole('button', {
    name: worktree.isMain
      ? `Main worktree, checked out branch ${worktree.branch}`
      : `${worktree.displayName}, checked out branch ${worktree.branch}`,
  });
}

describe('WorktreeList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sorts rows and preserves their path and branch presentation', async () => {
    const user = userEvent.setup();
    renderWorktreeList();

    let previous: HTMLButtonElement | undefined;
    for (const worktree of scenario.expectedWorktrees) {
      const button = worktreeButton(worktree);
      if (previous) expect(previous).toAppearBefore(button);
      previous = button;
      expect(within(button).getByText(worktree.displayName)).toBeVisible();
      if (!worktree.isMain)
        expect(within(button).getByText(worktree.branch)).toBeVisible();

      await user.hover(within(button).getByText(worktree.displayName));
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        scenario.expectedTooltips[worktree.id] ?? '',
      );
      await user.unhover(within(button).getByText(worktree.displayName));
    }
  });

  it('selects a row and removes only a non-main worktree', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onRemoveWorktree = vi.fn();
    renderWorktreeList({
      selectedId: scenario.selectableWorktree.id,
      onSelect,
      onRemoveWorktree,
    });

    await user.click(worktreeButton(scenario.selectableWorktree));
    const remove = screen.getByRole('button', {
      name: `Remove ${scenario.selectableWorktree.displayName} worktree`,
    });
    expect(remove).toHaveAttribute('title', 'Remove worktree');
    await user.click(remove);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.selectableWorktree.id);
    expect(onRemoveWorktree).toHaveBeenCalledOnce();
    expect(onRemoveWorktree).toHaveBeenCalledWith(scenario.selectableWorktree);
    expect(screen.queryByRole('button', { name: 'Remove main worktree' })).toBeNull();
  });

  it('cancels the inline new-worktree flow', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    const onCancelAdd = vi.fn();
    renderWorktreeList({ adding: true, onCancelAdd });

    expect(screen.getByRole('textbox', { name: 'Filter branches' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancelAdd).toHaveBeenCalledOnce();
  });

  it('creates a worktree through the inline flow', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(newWorktreeScenario.branches);
    vi.spyOn(api, 'suggestWorktreePath').mockResolvedValue(
      newWorktreeScenario.suggestedPath,
    );
    const createWorktree = vi
      .spyOn(api, 'createWorktree')
      .mockResolvedValue(newWorktreeScenario.createdResult);
    const onCreated = vi.fn();
    renderWorktreeList({
      project: newWorktreeScenario.project,
      adding: true,
      onCreated,
    });

    await user.click(
      await screen.findByRole('button', { name: newWorktreeScenario.availableBranch }),
    );
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Path' })).toHaveValue(
        newWorktreeScenario.suggestedPath,
      );
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(createWorktree).toHaveBeenCalledOnce();
    expect(createWorktree).toHaveBeenCalledWith({
      branch: newWorktreeScenario.availableBranch,
      path: newWorktreeScenario.suggestedPath,
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(onCreated).toHaveBeenCalledWith(newWorktreeScenario.createdResult, {
      path: newWorktreeScenario.suggestedPath,
    });
  });

  it('reports a create failure and keeps the form recoverable', async () => {
    const user = userEvent.setup();
    const message = 'The worktree could not be created.';
    vi.spyOn(api, 'listBranches').mockResolvedValue(newWorktreeScenario.branches);
    vi.spyOn(api, 'suggestWorktreePath').mockResolvedValue(
      newWorktreeScenario.suggestedPath,
    );
    vi.spyOn(api, 'createWorktree').mockRejectedValue(new Error(message));
    const onError = vi.fn();
    renderWorktreeList({
      project: newWorktreeScenario.project,
      adding: true,
      onError,
    });

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
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith(message);
    expect(screen.getByRole('textbox', { name: 'Filter branches' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });
});
