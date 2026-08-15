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

  it('composes repository identity, worktree section, and settings in order', () => {
    renderSidebar();

    const title = screen.getByText('Grafter');
    const repository = screen.getByRole('button', {
      name: `${scenario.repository.name} repository details`,
    });
    const worktrees = screen.getByText('Worktrees');
    const settings = screen.getByRole('button', { name: 'Settings' });

    expect(title).toBeVisible();
    expect(repository).toBeVisible();
    expect(worktrees).toBeVisible();
    expect(settings).toBeVisible();
    expect(title).toAppearBefore(repository);
    expect(repository).toAppearBefore(worktrees);
    expect(worktrees).toAppearBefore(settings);
    expect(screen.queryByRole('button', { name: /Collapse|Expand/ })).toBeNull();
    expect(screen.queryByText('Projects')).toBeNull();
    expect(screen.queryByTitle('Remove from Grafter')).toBeNull();
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

  it('navigates to repository details and exposes selected state', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ selectedId: scenario.repository.id, onSelect });

    const repository = screen.getByRole('button', {
      name: `${scenario.repository.name} repository details`,
    });
    expect(repository).toHaveAttribute('aria-current', 'page');
    await user.click(repository);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.repository.id);
  });

  it('opens settings dialog with the button', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    renderSidebar({ onOpenSettings });

    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toBeVisible();

    await user.click(settings);

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
