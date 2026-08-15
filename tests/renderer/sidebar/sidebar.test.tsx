// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSidebarWidth } from '../../../src/renderer/sidebar/ResizeHandle';
import { Sidebar } from '../../../src/renderer/sidebar/Sidebar';
import type { Worktree } from '../../../src/shared/contracts';
import { buildRepositoryWorktreesScenario } from '../../scenarios/sidebar/repository-worktrees';

const scenario = buildRepositoryWorktreesScenario();

interface RenderSidebarOptions {
  width?: number;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onAddWorktree?: () => void;
  onRemoveWorktree?: (worktree: Worktree) => void;
  onOpenSettings?: () => void;
  onResize?: (width: number) => void;
}

function renderSidebar(options: RenderSidebarOptions = {}): {
  rerender: (nextOptions: RenderSidebarOptions) => void;
} {
  const props = (next: RenderSidebarOptions = options) => ({
    homeDirectory: scenario.homeDirectory,
    repository: scenario.repository,
    width: next.width ?? options.width ?? defaultSidebarWidth,
    selectedId: next.selectedId ?? options.selectedId,
    selectedWorktreeStatus: undefined,
    onSelect: next.onSelect ?? options.onSelect ?? (() => undefined),
    onAddWorktree: next.onAddWorktree ?? options.onAddWorktree ?? (() => undefined),
    onRemoveWorktree:
      next.onRemoveWorktree ?? options.onRemoveWorktree ?? (() => undefined),
    onOpenSettings: next.onOpenSettings ?? options.onOpenSettings ?? (() => undefined),
    onResize: next.onResize ?? options.onResize ?? (() => undefined),
  });
  const view = render(<Sidebar {...props()} />);
  return {
    rerender: (nextOptions) => view.rerender(<Sidebar {...props(nextOptions)} />),
  };
}

describe('Sidebar', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('composes menu section and worktree section in order', () => {
    renderSidebar();

    const title = screen.getByText('Grafter');
    const menu = screen.getByRole('navigation', { name: 'Menu' });
    const newWorktree = screen.getByRole('button', { name: 'New worktree' });
    const settings = screen.getByRole('button', { name: 'Settings' });
    const worktrees = screen.getByText('Worktrees');

    expect(title).toBeVisible();
    expect(menu).toBeVisible();
    expect(newWorktree).toBeVisible();
    expect(settings).toBeVisible();
    expect(worktrees).toBeVisible();
    expect(title).toAppearBefore(newWorktree);
    expect(newWorktree).toAppearBefore(settings);
    expect(settings).toAppearBefore(worktrees);
    expect(screen.queryByRole('button', { name: /Collapse|Expand/ })).toBeNull();
    expect(screen.queryByText('Projects')).toBeNull();
    expect(screen.queryByTitle('Remove from Grafter')).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: `${scenario.repository.name} repository details`,
      }),
    ).toBeNull();
  });

  it('renders the worktree rows from the worktree section', () => {
    renderSidebar();

    const listbox = screen.getByRole('listbox', {
      name: `${scenario.repository.name} worktrees`,
    });
    expect(listbox).toBeVisible();
    expect(screen.getAllByRole('option', { name: /checked out branch/ })).toHaveLength(
      scenario.repository.worktrees.length,
    );
  });

  it('opens new worktree dialog from menu item', async () => {
    const user = userEvent.setup();
    const onAddWorktree = vi.fn();
    renderSidebar({ onAddWorktree });

    const newWorktree = screen.getByRole('button', { name: 'New worktree' });
    expect(newWorktree).toBeVisible();
    await user.click(newWorktree);

    expect(onAddWorktree).toHaveBeenCalledOnce();
  });

  it('opens settings dialog from menu item', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    renderSidebar({ onOpenSettings });

    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toBeVisible();

    await user.click(settings);

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
