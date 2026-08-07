// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
import { defaultSidebarWidth, Sidebar } from '../../../src/renderer/sidebar/Sidebar';
import type { GrafterApi, Worktree } from '../../../src/shared/contracts';
import { buildRepositoryWorktreesScenario } from '../../scenarios/sidebar/repository-worktrees';

const scenario = buildRepositoryWorktreesScenario();

interface RenderSidebarOptions {
  width?: number;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onOpenRepository?: () => void;
  onCreated?: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveWorktree?: (worktree: Worktree) => void;
  onOpenSettings?: () => void;
  onResize?: (width: number) => void;
}

function renderSidebar(options: RenderSidebarOptions = {}): void {
  render(
    <Sidebar
      homeDirectory={scenario.homeDirectory}
      repository={scenario.repository}
      width={options.width ?? defaultSidebarWidth}
      selectedId={options.selectedId}
      onSelect={options.onSelect ?? (() => undefined)}
      onOpenRepository={options.onOpenRepository ?? (() => undefined)}
      onCreated={options.onCreated ?? (() => undefined)}
      onRemoveWorktree={options.onRemoveWorktree ?? (() => undefined)}
      onOpenSettings={options.onOpenSettings ?? (() => undefined)}
      onError={() => undefined}
      onResize={options.onResize ?? (() => undefined)}
    />,
  );
}

describe('Sidebar', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('composes repository identity, flat worktrees, and settings in order', () => {
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

  it('opens another repository without mutating the current sidebar', async () => {
    const user = userEvent.setup();
    const onOpenRepository = vi.fn();
    renderSidebar({ onOpenRepository });

    const openRepository = screen.getByRole('button', { name: 'Open Repository...' });
    expect(openRepository).toBeVisible();
    await user.click(openRepository);

    expect(onOpenRepository).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', {
        name: `${scenario.repository.name} repository details`,
      }),
    ).toBeVisible();
  });

  it('opens and cancels the repository-level new-worktree flow with the keyboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    renderSidebar();

    const addWorktree = screen.getByRole('button', {
      name: `Add worktree to ${scenario.repository.name}`,
    });
    addWorktree.focus();
    expect(addWorktree).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('textbox', { name: 'Filter branches' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Filter branches' })).toBeNull();
  });

  it('opens settings from the global sidebar actions', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    renderSidebar({ onOpenSettings });

    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toBeVisible();

    await user.click(settings);

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it.each([
    {
      label: 'left',
      width: defaultSidebarWidth,
      key: '{ArrowLeft}',
      expectedWidth: defaultSidebarWidth - 16,
    },
    {
      label: 'right',
      width: defaultSidebarWidth,
      key: '{ArrowRight}',
      expectedWidth: defaultSidebarWidth + 16,
    },
    {
      label: 'home',
      width: 360,
      key: '{Home}',
      expectedWidth: defaultSidebarWidth,
    },
    {
      label: 'minimum boundary',
      width: 230,
      key: '{ArrowLeft}',
      expectedWidth: 230,
    },
    {
      label: 'maximum boundary',
      width: 480,
      key: '{ArrowRight}',
      expectedWidth: 480,
    },
  ])('resizes $label with the keyboard', async ({ width, key, expectedWidth }) => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    renderSidebar({ width, onResize });

    const resizeHandle = screen.getByRole('separator', {
      name: 'Resize repository sidebar',
    });
    expect(resizeHandle).toHaveAttribute('aria-valuenow', String(width));
    resizeHandle.focus();
    expect(resizeHandle).toHaveFocus();
    await user.keyboard(key);

    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(expectedWidth);
  });

  it('resets the sidebar width with a double click', async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    renderSidebar({ width: 360, onResize });

    await user.dblClick(
      screen.getByRole('separator', { name: 'Resize repository sidebar' }),
    );

    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(defaultSidebarWidth);
  });

  it('resizes the sidebar by dragging its handle', async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    renderSidebar({ onResize });

    const resizeHandle = screen.getByRole('separator', {
      name: 'Resize repository sidebar',
    });
    const setPointerCapture = vi.spyOn(resizeHandle, 'setPointerCapture');
    const releasePointerCapture = vi.spyOn(resizeHandle, 'releasePointerCapture');
    await user.pointer([
      {
        keys: '[MouseLeft>]',
        target: resizeHandle,
        coords: { clientX: 300 },
      },
      {
        target: resizeHandle,
        coords: { clientX: 350 },
      },
      {
        keys: '[/MouseLeft]',
        target: resizeHandle,
        coords: { clientX: 350 },
      },
    ]);

    expect(setPointerCapture).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(defaultSidebarWidth + 50);
    expect(releasePointerCapture).toHaveBeenCalledOnce();
  });
});
