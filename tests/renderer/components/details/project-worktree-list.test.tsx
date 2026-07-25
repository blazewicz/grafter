// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectWorktreeList } from '../../../../src/renderer/components/details/ProjectWorktreeList';
import type { Worktree } from '../../../../src/shared/contracts';

const mainWorktree: Worktree = {
  id: 'project:main',
  projectId: 'project',
  displayName: 'main',
  path: '/Users/kasia/projects/repo',
  branch: 'main',
  head: '1234567',
  isMain: true,
  locked: false,
};

const alphaWorktree: Worktree = {
  id: 'project:alpha',
  projectId: 'project',
  displayName: 'alpha',
  path: '/Users/kasia/worktrees/alpha',
  branch: 'feature/alpha',
  head: '2345678',
  isMain: false,
  locked: false,
};

const collisionWorktree: Worktree = {
  id: 'project:collision',
  projectId: 'project',
  displayName: 'b77c/repo',
  path: '/Users/kasia/worktrees/b77c/repo',
  branch: 'feature/worktree-first',
  head: '3456789',
  isMain: false,
  locked: false,
};

function renderProjectWorktreeList(
  worktrees: Worktree[] = [collisionWorktree, alphaWorktree, mainWorktree],
  onSelect: (worktreeId: string) => void = () => undefined,
  homeDirectory = '/Users/kasia',
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
    expect(pathButtons.map((button) => button.textContent)).toEqual([
      '~/projects/repo',
      '~/worktrees/alpha',
      '~/worktrees/b77c/repo',
    ]);
    expect(pathButtons[0]).toHaveAttribute('title', '~/projects/repo');
    expect(pathButtons[1]).toHaveAttribute('title', '~/worktrees/alpha');
    expect(pathButtons[2]).toHaveAttribute('title', '~/worktrees/b77c/repo');
    expect(within(worktrees).getByText('main')).toBeVisible();
    expect(within(worktrees).getByText('feature/alpha')).toBeVisible();
    expect(within(worktrees).getByText('feature/worktree-first')).toBeVisible();
  });

  it.each([
    {
      path: '/home/kasia/git/repo.worktrees/feature',
      expectedDisplayedPath: '~/git/repo.worktrees/feature',
    },
    {
      path: '/home/kasia/worktrees/123456/repo',
      expectedDisplayedPath: '~/worktrees/123456/repo',
    },
    {
      path: '/home/marek/repo.worktrees/feature',
      expectedDisplayedPath: '/home/marek/repo.worktrees/feature',
    },
  ])('shows $path as $expectedDisplayedPath', ({ path, expectedDisplayedPath }) => {
    renderProjectWorktreeList([{ ...alphaWorktree, path }], undefined, '/home/kasia/');

    expect(screen.getByRole('button', { name: expectedDisplayedPath })).toHaveAttribute(
      'title',
      expectedDisplayedPath,
    );
  });

  it.each([
    { worktrees: [], expected: '0 worktrees' },
    { worktrees: [mainWorktree], expected: '1 worktree' },
    { worktrees: [mainWorktree, alphaWorktree], expected: '2 worktrees' },
  ])('shows "$expected" for the worktree count', ({ worktrees, expected }) => {
    renderProjectWorktreeList(worktrees);

    expect(screen.getByText(expected)).toBeVisible();
  });

  it('selects the worktree represented by the chosen path', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderProjectWorktreeList(undefined, onSelect);

    const alphaPath = screen.getByRole('button', { name: '~/worktrees/alpha' });
    expect(alphaPath).toBeVisible();
    await user.click(alphaPath);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(alphaWorktree.id);
  });
});
