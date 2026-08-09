// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
import { WorktreeList } from '../../../src/renderer/sidebar/WorktreeList';
import type {
  GrafterApi,
  Project,
  Worktree,
  WorktreeStatus,
} from '../../../src/shared/contracts';
import type { WorktreeSortOrder } from '../../../src/shared/worktree-list';
import { buildNewWorktreeScenario } from '../../scenarios/sidebar/new-worktree';
import { buildRepositoryWorktreesScenario } from '../../scenarios/sidebar/repository-worktrees';

const scenario = buildRepositoryWorktreesScenario();
const newWorktreeScenario = buildNewWorktreeScenario();

interface RenderWorktreeListOptions {
  project?: Project;
  selectedId?: string;
  selectedWorktreeStatus?: WorktreeStatus;
  sortOrder?: WorktreeSortOrder;
  filterQuery?: string;
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
      selectedWorktreeStatus={options.selectedWorktreeStatus}
      sortOrder={options.sortOrder ?? 'path'}
      filterQuery={options.filterQuery ?? ''}
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

  it.each([
    {
      field: 'path',
      query: scenario.pathFilterWorktree.path.toLocaleUpperCase(),
      expected: scenario.pathFilterWorktree,
    },
    {
      field: 'branch',
      query: scenario.branchFilterWorktree.branch.toLocaleUpperCase(),
      expected: scenario.branchFilterWorktree,
    },
  ])('filters worktrees case-insensitively by $field', ({ query, expected }) => {
    renderWorktreeList({ filterQuery: query });

    expect(worktreeButton(expected)).toBeVisible();
    for (const worktree of scenario.expectedWorktrees) {
      if (worktree.id === expected.id) continue;
      expect(
        screen.queryByRole('button', {
          name: worktree.isMain
            ? `Main worktree, checked out branch ${worktree.branch}`
            : `${worktree.displayName}, checked out branch ${worktree.branch}`,
        }),
      ).toBeNull();
    }
  });

  it('shows an empty result for a filter with no matching path or branch', () => {
    const query = 'missing-worktree-filter';
    renderWorktreeList({ filterQuery: query });

    expect(screen.getByRole('status')).toHaveTextContent(`No worktrees match “${query}”`);
    expect(screen.queryByRole('button', { name: /checked out branch/ })).toBeNull();
  });

  it.each([{ sortOrder: 'path' as const }, { sortOrder: 'branch' as const }])(
    'shows worktrees sorted by $sortOrder',
    ({ sortOrder }) => {
      renderWorktreeList({ sortOrder });

      const expected =
        sortOrder === 'path'
          ? scenario.expectedWorktrees
          : scenario.expectedWorktreesByBranch;

      let previous: HTMLButtonElement | undefined;
      for (const worktree of expected) {
        const button = worktreeButton(worktree);
        if (previous) expect(previous).toAppearBefore(button);
        previous = button;
      }
    },
  );

  it('shows worktree display name and branch name with a full version in tooltips', async () => {
    const user = userEvent.setup();
    renderWorktreeList();

    for (const worktree of scenario.expectedWorktrees) {
      const button = worktreeButton(worktree);

      const displayName = within(button).getByText(worktree.displayName, {
        selector: '[data-worktree-path] > span',
      });
      expect(displayName).toBeVisible();
      await user.hover(displayName);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        scenario.expectedTooltips[worktree.id] ?? '',
      );
      await user.unhover(displayName);

      const branchName = within(button).getByText(worktree.branch, {
        selector: '[data-branch-name] > span',
      });
      expect(branchName).toBeVisible();
      await user.hover(branchName);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(worktree.branch);
      await user.unhover(branchName);
    }
  });

  it('shows available dirty and pull request badges in the worktree top line', () => {
    const worktree = scenario.selectableWorktree;
    renderWorktreeList({
      selectedId: worktree.id,
      selectedWorktreeStatus: 'dirty',
    });

    const button = worktreeButton(worktree);
    expect(within(button).getByRole('img', { name: 'Dirty worktree' })).toHaveAttribute(
      'title',
      'Uncommitted changes',
    );
    expect(
      within(button).getByRole('img', { name: 'Pull request status: open' }),
    ).toHaveAttribute('title', 'Status: Open');
  });

  it('omits badges when their state is unavailable', () => {
    renderWorktreeList();

    const mainWorktree = scenario.expectedWorktrees.find((worktree) => worktree.isMain);
    if (!mainWorktree) throw new Error('Expected a main worktree.');
    const mainButton = worktreeButton(mainWorktree);
    expect(within(mainButton).queryByLabelText('Worktree badges')).toBeNull();
    expect(screen.queryByRole('img', { name: 'Dirty worktree' })).toBeNull();
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
