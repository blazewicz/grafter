// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { worktreeListboxId } from '../../../src/renderer/sidebar/WorktreeSection';
import { WorktreeSection } from '../../../src/renderer/sidebar/WorktreeSection';
import { worktreeRowId } from '../../../src/renderer/sidebar/WorktreeRow';
import type { Worktree } from '../../../src/shared/contracts';
import { filterWorktrees, sortWorktrees } from '../../../src/shared/worktree-list';
import { buildRepositoryWorktreesScenario } from '../../scenarios/sidebar/repository-worktrees';

const scenario = buildRepositoryWorktreesScenario();

interface RenderWorktreeSectionOptions {
  selectedId?: string;
  onSelect?: (id: string) => void;
  onRemoveWorktree?: (worktree: Worktree) => void;
}

function renderWorktreeSection(options: RenderWorktreeSectionOptions = {}): {
  rerender: (nextOptions: RenderWorktreeSectionOptions) => void;
} {
  const props = (next: RenderWorktreeSectionOptions = options) => ({
    homeDirectory: scenario.homeDirectory,
    repository: scenario.repository,
    selectedId: next.selectedId ?? options.selectedId,
    selectedWorktreeStatus: undefined,
    onSelect: next.onSelect ?? options.onSelect ?? (() => undefined),
    onRemoveWorktree:
      next.onRemoveWorktree ?? options.onRemoveWorktree ?? (() => undefined),
  });
  const view = render(<WorktreeSection {...props()} />);
  return {
    rerender: (nextOptions) => view.rerender(<WorktreeSection {...props(nextOptions)} />),
  };
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

describe('WorktreeSection', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('exposes the worktree rows as a listbox named after the repository', () => {
    renderWorktreeSection();

    const listbox = screen.getByRole('listbox', {
      name: `${scenario.repository.name} worktrees`,
    });
    expect(listbox).toHaveAttribute('id', worktreeListboxId);
    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute(
      'id',
      worktreeRowId(expectedWorktreeAt(0).id),
    );
  });

  it('shows an empty result when the filter matches no worktree', async () => {
    const user = userEvent.setup();
    renderWorktreeSection();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    await user.type(
      screen.getByRole<HTMLInputElement>('combobox', {
        name: 'Filter worktrees by path or branch',
      }),
      'missing-worktree-filter',
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'No worktrees match “missing-worktree-filter”',
    );
    expect(screen.queryByRole('option', { name: /checked out branch/ })).toBeNull();
  });

  it('sorts worktrees from the header options menu', async () => {
    const user = userEvent.setup();
    renderWorktreeSection();

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
    renderWorktreeSection();
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
    renderWorktreeSection();
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

  it('swaps the heading label for the inline filter input while open', async () => {
    const user = userEvent.setup();
    renderWorktreeSection();

    expect(screen.getByText('Worktrees')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));

    expect(screen.queryByText('Worktrees')).toBeNull();
    expect(
      screen.getByRole<HTMLInputElement>('combobox', {
        name: 'Filter worktrees by path or branch',
      }),
    ).toBeVisible();

    await user.keyboard('{Escape}');

    expect(screen.getByText('Worktrees')).toBeVisible();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('opens and refocuses worktree search with Command-F, then closes it on Escape', async () => {
    const user = userEvent.setup();
    renderWorktreeSection();

    await user.keyboard('{Meta>}f{/Meta}');
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    expect(input).toHaveFocus();

    await user.type(input, scenario.branchFilterWorktree.branch);
    screen.getByRole('button', { name: 'Worktree list options' }).focus();
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
    renderWorktreeSection();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    expect(input).toHaveFocus();

    await user.click(screen.getByRole('listbox'));

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter worktrees' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('keeps the worktree search open on outside clicks while a query exists', async () => {
    const user = userEvent.setup();
    renderWorktreeSection();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    await user.type(
      screen.getByRole<HTMLInputElement>('combobox', {
        name: 'Filter worktrees by path or branch',
      }),
      scenario.branchFilterWorktree.branch,
    );

    await user.click(screen.getByRole('listbox'));

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
    renderWorktreeSection({ onSelect });

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

  it('leaves the worktree highlight untouched by arrow keys when the filter is closed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWorktreeSection({ selectedId: expectedWorktreeAt(0).id, onSelect });

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{Enter}');

    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not move keyboard control to the list when clicking a row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWorktreeSection({ selectedId: scenario.selectableWorktree.id, onSelect });

    await user.click(worktreeOption(scenario.selectableWorktree));
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.selectableWorktree.id);
    expect(worktreeOption(scenario.selectableWorktree)).not.toHaveFocus();
  });

  it('wires the filter combobox to the listbox and active row', async () => {
    const user = userEvent.setup();
    renderWorktreeSection({ selectedId: expectedWorktreeAt(1).id });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });

    expect(input).toHaveAttribute('aria-controls', worktreeListboxId);
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      worktreeRowId(expectedWorktreeAt(1).id),
    );
  });

  it('limits the tab stops to the highlighted row when the filter is closed', () => {
    renderWorktreeSection({ selectedId: expectedWorktreeAt(1).id });

    expect(worktreeOption(expectedWorktreeAt(1))).toHaveAttribute('tabindex', '0');
    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute('tabindex', '-1');
    const selectedRow = worktreeOption(expectedWorktreeAt(1)).parentElement;
    if (!selectedRow) throw new Error('Expected a row container.');
    expect(
      within(selectedRow).getByRole('button', {
        name: `Remove ${expectedWorktreeAt(1).displayName} worktree`,
      }),
    ).toHaveAttribute('tabindex', '0');
    expect(
      screen.getByRole('button', {
        name: `Remove ${scenario.selectableWorktree.displayName} worktree`,
      }),
    ).toHaveAttribute('tabindex', '-1');
  });

  it('removes the rows from the tab order while the filter is open', async () => {
    const user = userEvent.setup();
    renderWorktreeSection({ selectedId: expectedWorktreeAt(1).id });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));

    expect(worktreeOption(expectedWorktreeAt(1))).toHaveAttribute('tabindex', '-1');
    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute('tabindex', '-1');
  });

  it('restores the highlight to the selected worktree when the filter query is cleared', async () => {
    const user = userEvent.setup();
    renderWorktreeSection({ selectedId: expectedWorktreeAt(1).id });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    await user.type(input, scenario.branchFilterWorktree.branch);

    expect(input).toHaveAttribute(
      'aria-activedescendant',
      worktreeRowId(scenario.branchFilterWorktree.id),
    );

    await user.clear(input);

    expect(input).toHaveAttribute(
      'aria-activedescendant',
      worktreeRowId(expectedWorktreeAt(1).id),
    );
    expect(worktreeOption(expectedWorktreeAt(1))).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('highlights the top filtered match while typing in the filter', async () => {
    const user = userEvent.setup();
    renderWorktreeSection();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    await user.type(input, scenario.branchFilterWorktree.branch);

    expect(worktreeOption(scenario.branchFilterWorktree)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      worktreeRowId(scenario.branchFilterWorktree.id),
    );
  });

  it('highlights the top filtered match over a matching selected worktree', async () => {
    const user = userEvent.setup();
    const filtered = filterWorktrees(
      sortWorktrees(scenario.repository.worktrees, 'path'),
      scenario.repository.name,
    );
    const topMatch = filtered[0]?.worktree;
    const selectedMatch = filtered[1]?.worktree;
    if (!topMatch || !selectedMatch) throw new Error('Expected at least two matches.');

    renderWorktreeSection({ selectedId: selectedMatch.id });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    await user.type(input, scenario.repository.name);

    expect(worktreeOption(topMatch)).toHaveAttribute('aria-selected', 'true');
    expect(worktreeOption(selectedMatch)).not.toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', worktreeRowId(topMatch.id));
  });

  it('commits the top filtered match with Enter in the filter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWorktreeSection({ onSelect });

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
    renderWorktreeSection({ onSelect });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    await user.type(input, scenario.repository.name);

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
    expect(input).toHaveAttribute('aria-activedescendant', worktreeRowId(secondMatch.id));
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(secondMatch.id);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('jumps to the first and last worktree with Home and End in the filter', async () => {
    const user = userEvent.setup();
    renderWorktreeSection();

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });

    await user.keyboard('{End}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      worktreeRowId(expectedWorktreeAt(scenario.expectedWorktrees.length - 1).id),
    );
    await user.keyboard('{Home}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      worktreeRowId(expectedWorktreeAt(0).id),
    );
  });

  it('follows the selected worktree when it changes outside the filter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = renderWorktreeSection({
      selectedId: expectedWorktreeAt(0).id,
      onSelect,
    });

    await user.click(screen.getByRole('button', { name: 'Filter worktrees' }));
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'Filter worktrees by path or branch',
    });
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      worktreeRowId(expectedWorktreeAt(1).id),
    );

    rerender({ selectedId: expectedWorktreeAt(2).id });

    expect(input).toHaveAttribute(
      'aria-activedescendant',
      worktreeRowId(expectedWorktreeAt(2).id),
    );
  });

  it('closes the filter and restores the highlight on Escape', async () => {
    const user = userEvent.setup();
    renderWorktreeSection();

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

  it('does not include the new-worktree button in heading actions', () => {
    renderWorktreeSection();

    expect(
      screen.queryByRole('button', {
        name: `Add worktree to ${scenario.repository.name}`,
      }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter worktrees' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Worktree list options' })).toBeVisible();
  });
});
