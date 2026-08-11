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
      selectedWorktreeStatus={undefined}
      onSelect={options.onSelect ?? (() => undefined)}
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

  it('sorts worktrees from the header options menu', async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.queryByRole('button', { name: 'Open Repository...' })).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Worktree list options' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Sort worktrees' });
    const byPath = screen.getByRole('menuitemradio', { name: 'By path' });
    const byBranch = screen.getByRole('menuitemradio', { name: 'By branch' });
    expect(menu).toBeVisible();
    expect(byPath).toHaveAttribute('aria-checked', 'true');
    expect(byPath).toHaveFocus();
    expect(byBranch).toHaveAttribute('aria-checked', 'false');

    await user.click(byBranch);

    expect(screen.queryByRole('menu', { name: 'Sort worktrees' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    let previous: HTMLElement | undefined;
    for (const worktree of scenario.expectedWorktreesByBranch) {
      const button = screen.getByRole('button', {
        name: worktree.isMain
          ? `Main worktree, checked out branch ${worktree.branch}`
          : `${worktree.displayName}, checked out branch ${worktree.branch}`,
      });
      if (previous) expect(previous).toAppearBefore(button);
      previous = button;
    }

    await user.click(trigger);
    expect(screen.getByRole('menuitemradio', { name: 'By branch' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('navigates and dismisses the sort menu with the keyboard', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const trigger = screen.getByRole('button', { name: 'Worktree list options' });

    trigger.focus();
    await user.keyboard('{Enter}');
    const byBranch = screen.getByRole('menuitemradio', { name: 'By branch' });
    await user.keyboard('{ArrowDown}');
    expect(byBranch).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu', { name: 'Sort worktrees' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('unfolds, filters, and clears the worktree search from its header action', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const trigger = screen.getByRole('button', { name: 'Filter worktrees' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('searchbox', { name: 'Filter worktrees by path or branch' }),
    ).toBeNull();
    await user.click(trigger);

    const input = screen.getByRole<HTMLInputElement>('searchbox', {
      name: 'Filter worktrees by path or branch',
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveFocus();
    await user.type(input, scenario.branchFilterWorktree.branch);

    expect(
      screen.getByRole('button', {
        name: `${scenario.branchFilterWorktree.displayName}, checked out branch ${scenario.branchFilterWorktree.branch}`,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: `Main worktree, checked out branch ${scenario.expectedWorktrees[0]?.branch}`,
      }),
    ).toBeNull();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: `Main worktree, checked out branch ${scenario.expectedWorktrees[0]?.branch}`,
      }),
    ).toBeVisible();
  });

  it('opens and refocuses worktree search with Command-F, then closes it on Escape', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.keyboard('{Meta>}f{/Meta}');
    const input = screen.getByRole<HTMLInputElement>('searchbox', {
      name: 'Filter worktrees by path or branch',
    });
    expect(input).toHaveFocus();

    await user.type(input, scenario.branchFilterWorktree.branch);
    screen.getByRole('button', { name: 'Settings' }).focus();
    await user.keyboard('{Meta>}f{/Meta}');

    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(scenario.branchFilterWorktree.branch.length);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: `Main worktree, checked out branch ${scenario.expectedWorktrees[0]?.branch}`,
      }),
    ).toBeVisible();
  });

  it('closes and clears worktree search after selecting a filtered worktree', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ onSelect });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    await user.type(
      screen.getByRole('searchbox', {
        name: 'Filter worktrees by path or branch',
      }),
      scenario.branchFilterWorktree.branch,
    );
    await user.click(
      screen.getByRole('button', {
        name: `${scenario.branchFilterWorktree.displayName}, checked out branch ${scenario.branchFilterWorktree.branch}`,
      }),
    );

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.branchFilterWorktree.id);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter worktrees' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(
      screen.getByRole('button', {
        name: `Main worktree, checked out branch ${scenario.expectedWorktrees[0]?.branch}`,
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
