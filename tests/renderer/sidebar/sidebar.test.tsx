// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
import { defaultSidebarWidth, Sidebar } from '../../../src/renderer/sidebar/Sidebar';
import type { Worktree } from '../../../src/shared/contracts';
import { filterWorktrees, sortWorktrees } from '../../../src/shared/worktree-list';
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

function renderSidebar(options: RenderSidebarOptions = {}): void {
  render(
    <Sidebar
      homeDirectory={scenario.homeDirectory}
      repository={scenario.repository}
      width={options.width ?? defaultSidebarWidth}
      selectedId={options.selectedId}
      selectedWorktreeStatus={undefined}
      onSelect={options.onSelect ?? (() => undefined)}
      onAddWorktree={options.onAddWorktree ?? (() => undefined)}
      onRemoveWorktree={options.onRemoveWorktree ?? (() => undefined)}
      onOpenSettings={options.onOpenSettings ?? (() => undefined)}
      onResize={options.onResize ?? (() => undefined)}
    />,
  );
}

function worktreeOption(worktree: Worktree): HTMLElement {
  return screen.getByRole('option', {
    name: worktree.isMain
      ? `Main worktree, checked out branch ${worktree.branch}`
      : `${worktree.displayName}, checked out branch ${worktree.branch}`,
  });
}

function expectedWorktreeAt(index: number): Worktree {
  const worktree = scenario.expectedWorktrees[index];
  if (!worktree) throw new Error(`Expected a worktree at index ${index}.`);
  return worktree;
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
      const option = worktreeOption(worktree);
      if (previous) expect(previous).toAppearBefore(option);
      previous = option;
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
      screen.queryByRole('combobox', { name: 'Filter worktrees by path or branch' }),
    ).toBeNull();
    await user.click(trigger);

    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveFocus();
    await user.type(input, scenario.branchFilterWorktree.branch);

    expect(worktreeOption(scenario.branchFilterWorktree)).toBeVisible();
    expect(
      screen.queryByRole('option', {
        name: `Main worktree, checked out branch ${scenario.expectedWorktrees[0]?.branch}`,
      }),
    ).toBeNull();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(
      screen.getByRole('option', {
        name: `Main worktree, checked out branch ${scenario.expectedWorktrees[0]?.branch}`,
      }),
    ).toBeVisible();
  });

  it('opens and refocuses worktree search with Command-F, then closes it on Escape', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.keyboard('{Meta>}f{/Meta}');
    const input = screen.getByRole<HTMLInputElement>('combobox', {
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

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(
      screen.getByRole('option', {
        name: `Main worktree, checked out branch ${scenario.expectedWorktrees[0]?.branch}`,
      }),
    ).toBeVisible();
  });

  it('closes an empty worktree search when clicking outside it', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    expect(input).toHaveFocus();

    await user.click(screen.getByText('Worktrees'));

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter worktrees' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('keeps the worktree search open on outside clicks while a query exists', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    await user.type(
      screen.getByRole<HTMLInputElement>('combobox', {
        name: 'Filter worktrees by path or branch',
      }),
      scenario.branchFilterWorktree.branch,
    );

    await user.click(screen.getByText('Worktrees'));

    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    expect(input).toBeVisible();
    expect(input).toHaveValue(scenario.branchFilterWorktree.branch);
    expect(worktreeOption(scenario.branchFilterWorktree)).toBeVisible();
  });

  it('closes and clears worktree search after selecting a filtered worktree', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ onSelect });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    await user.type(
      screen.getByRole('combobox', {
        name: 'Filter worktrees by path or branch',
      }),
      scenario.branchFilterWorktree.branch,
    );
    await user.click(worktreeOption(scenario.branchFilterWorktree));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.branchFilterWorktree.id);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter worktrees' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(
      screen.getByRole('option', {
        name: `Main worktree, checked out branch ${scenario.expectedWorktrees[0]?.branch}`,
      }),
    ).toBeVisible();
  });

  it('moves the worktree highlight with arrow keys and commits with Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ onSelect });

    await user.keyboard('{ArrowDown}');
    expect(worktreeOption(expectedWorktreeAt(1))).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(onSelect).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(expectedWorktreeAt(2).id);
  });

  it('wraps the worktree highlight around the list edges', async () => {
    const user = userEvent.setup();
    renderSidebar({ selectedId: expectedWorktreeAt(0).id });

    await user.keyboard('{ArrowUp}');
    expect(
      worktreeOption(expectedWorktreeAt(scenario.expectedWorktrees.length - 1)),
    ).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('jumps the worktree highlight to first and last with Home and End', async () => {
    const user = userEvent.setup();
    renderSidebar({ selectedId: expectedWorktreeAt(1).id });

    await user.keyboard('{End}');
    expect(
      worktreeOption(expectedWorktreeAt(scenario.expectedWorktrees.length - 1)),
    ).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('restores the highlight to the selection with Escape', async () => {
    const user = userEvent.setup();
    renderSidebar({ selectedId: expectedWorktreeAt(0).id });

    await user.keyboard('{ArrowDown}');
    expect(worktreeOption(expectedWorktreeAt(1))).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{Escape}');

    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('does not hijack Enter from a focused row action', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onRemoveWorktree = vi.fn();
    renderSidebar({
      selectedId: scenario.selectableWorktree.id,
      onSelect,
      onRemoveWorktree,
    });

    const remove = screen.getByRole('button', {
      name: `Remove ${scenario.selectableWorktree.displayName} worktree`,
    });
    remove.focus();
    await user.keyboard('{Enter}');

    expect(onRemoveWorktree).toHaveBeenCalledOnce();
    expect(onRemoveWorktree).toHaveBeenCalledWith(scenario.selectableWorktree);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('highlights the top filtered match while typing in the filter', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    await user.type(
      screen.getByRole<HTMLInputElement>('combobox', {
        name: 'Filter worktrees by path or branch',
      }),
      scenario.branchFilterWorktree.branch,
    );

    expect(worktreeOption(scenario.branchFilterWorktree)).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('commits the top filtered match with Enter in the filter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ onSelect });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    await user.type(
      screen.getByRole<HTMLInputElement>('combobox', {
        name: 'Filter worktrees by path or branch',
      }),
      scenario.branchFilterWorktree.branch,
    );
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.branchFilterWorktree.id);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('navigates the filtered worktrees with arrow keys in the filter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ onSelect });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    await user.type(
      screen.getByRole<HTMLInputElement>('combobox', {
        name: 'Filter worktrees by path or branch',
      }),
      scenario.repository.name,
    );

    const filtered = filterWorktrees(
      sortWorktrees(scenario.repository.worktrees, 'path'),
      scenario.repository.name,
    );
    const firstMatch = filtered[0]?.worktree;
    const secondMatch = filtered[1]?.worktree;
    if (!firstMatch || !secondMatch) throw new Error('Expected at least two matches.');

    expect(worktreeOption(firstMatch)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(worktreeOption(secondMatch)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(secondMatch.id);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('closes the filter and restores the highlight on Escape', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    await user.type(
      screen.getByRole<HTMLInputElement>('combobox', {
        name: 'Filter worktrees by path or branch',
      }),
      scenario.branchFilterWorktree.branch,
    );
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens new worktree dialog with the button', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    const onAddWorktree = vi.fn();
    renderSidebar({ onAddWorktree });

    const addWorktree = screen.getByRole('button', {
      name: `Add worktree to ${scenario.repository.name}`,
    });
    expect(addWorktree).toBeVisible();

    await user.click(addWorktree);

    expect(onAddWorktree).toHaveBeenCalledOnce();
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
