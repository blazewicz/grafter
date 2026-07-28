// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectWorktreeList } from '../../../src/renderer/details/ProjectWorktreeList';
import type { Worktree } from '../../../src/shared/contracts';
import { buildPathDisplayScenarios } from '../../scenarios/details/path-display';
import { buildWorktreeOrderingScenario } from '../../scenarios/details/worktree-ordering';

const orderingScenario = buildWorktreeOrderingScenario();
const pathScenarios = buildPathDisplayScenarios();

function renderProjectWorktreeList(
  worktrees: Worktree[] = orderingScenario.unsortedWorktrees,
  onSelect: (worktreeId: string) => void = () => undefined,
  homeDirectory = orderingScenario.homeDirectory,
): void {
  render(
    <ProjectWorktreeList
      homeDirectory={homeDirectory}
      worktrees={worktrees}
      onSelect={onSelect}
    />,
  );
}

describe('ProjectWorktreeList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows sorted worktree paths with their branches', () => {
    renderProjectWorktreeList();

    const worktrees = screen.getByRole('region', { name: 'Worktrees' });
    const pathButtons = within(worktrees).getAllByRole('button');
    expect(pathButtons.map((button) => button.textContent)).toEqual(
      orderingScenario.expectedDisplayedPaths,
    );
    for (const [index, worktree] of orderingScenario.expectedWorktrees.entries()) {
      expect(pathButtons[index]).toHaveAttribute(
        'title',
        orderingScenario.expectedDisplayedPaths[index],
      );
      expect(within(worktrees).getByText(worktree.branch)).toBeVisible();
    }
  });

  it.each(pathScenarios)(
    'shows the $label topology as $expectedWorktreeListPath',
    (scenario) => {
      renderProjectWorktreeList([scenario.details], undefined, scenario.homeDirectory);

      expect(
        screen.getByRole('button', { name: scenario.expectedWorktreeListPath }),
      ).toHaveAttribute('title', scenario.expectedWorktreeListPath);
    },
  );

  it.each([
    { worktrees: [], expected: '0 worktrees' },
    { worktrees: [orderingScenario.mainWorktree], expected: '1 worktree' },
    {
      worktrees: [orderingScenario.mainWorktree, orderingScenario.selectableWorktree],
      expected: '2 worktrees',
    },
  ])('shows "$expected" for the worktree count', ({ worktrees, expected }) => {
    renderProjectWorktreeList(worktrees);

    expect(screen.getByText(expected)).toBeVisible();
  });

  it('selects the worktree represented by the chosen path', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderProjectWorktreeList(undefined, onSelect);

    const selectedPath = screen.getByRole('button', {
      name: orderingScenario.selectableDisplayedPath,
    });
    expect(selectedPath).toBeVisible();
    await user.click(selectedPath);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(orderingScenario.selectableWorktree.id);
  });
});
