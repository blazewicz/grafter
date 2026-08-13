// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BranchPicker } from '../../../src/renderer/branches/BranchPicker';
import type { Worktree } from '../../../src/shared/contracts';
import { buildBranchSwitchScenario } from '../../scenarios/details/branch-switch';

const scenario = buildBranchSwitchScenario();
const checkedOutWorktrees = [scenario.mainWorktree, scenario.details];

interface RenderBranchPickerOptions {
  branches?: readonly string[];
  worktrees?: readonly Worktree[];
  currentWorktreeId?: string;
  selectedBranch?: string;
  disableCheckedOut?: boolean;
  disabledBranches?: readonly string[];
  loading?: boolean;
  onQueryChange?: () => void;
  onSelect?: (branch: string) => void;
}

function renderBranchPicker(options: RenderBranchPickerOptions = {}): void {
  render(
    <BranchPicker
      branches={options.branches ?? scenario.branches}
      worktrees={options.worktrees ?? checkedOutWorktrees}
      currentWorktreeId={options.currentWorktreeId ?? scenario.details.id}
      onSelect={options.onSelect ?? (() => undefined)}
      {...(options.selectedBranch === undefined
        ? {}
        : { selectedBranch: options.selectedBranch })}
      {...(options.disableCheckedOut === undefined
        ? {}
        : { disableCheckedOut: options.disableCheckedOut })}
      {...(options.disabledBranches === undefined
        ? {}
        : { disabledBranches: options.disabledBranches })}
      {...(options.loading === undefined ? {} : { loading: options.loading })}
      {...(options.onQueryChange === undefined
        ? {}
        : { onQueryChange: options.onQueryChange })}
    />,
  );
}

describe('BranchPicker', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('focuses its filter and prevents selecting checked-out branches', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderBranchPicker({ onSelect });

    expect(screen.getByRole('textbox', { name: 'Filter branches' })).toHaveFocus();
    const currentBranch = screen.getByRole('button', {
      name: `${scenario.details.branch}: Currently checked out in this worktree`,
    });
    const otherWorktreeBranch = screen.getByRole('button', {
      name: `${scenario.mainWorktree.branch}: Already checked out in ${scenario.mainWorktree.displayName}`,
    });
    expect(currentBranch).toBeDisabled();
    expect(otherWorktreeBranch).toBeDisabled();
    expect(
      screen.getByRole('button', { name: scenario.availableWorktree.branch }),
    ).toBeEnabled();

    await user.click(currentBranch);
    await user.click(otherWorktreeBranch);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('allows checked-out branches for comparisons while blocking the opposite side', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderBranchPicker({
      selectedBranch: scenario.details.branch,
      disableCheckedOut: false,
      disabledBranches: [scenario.mainWorktree.branch],
      onSelect,
    });

    const selectedBranch = screen.getByRole('button', {
      name: scenario.details.branch,
    });
    expect(selectedBranch).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: `${scenario.mainWorktree.branch}: Already selected for comparison`,
      }),
    ).toBeDisabled();

    await user.click(selectedBranch);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.details.branch);
  });

  it('filters branches and publishes each query change', async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    renderBranchPicker({ onQueryChange });

    const filter = screen.getByRole('textbox', { name: 'Filter branches' });
    await user.type(filter, scenario.availableWorktree.branch);

    expect(filter).toHaveValue(scenario.availableWorktree.branch);
    expect(onQueryChange).toHaveBeenCalledTimes(scenario.availableWorktree.branch.length);
    expect(
      screen.getByRole('button', { name: scenario.availableWorktree.branch }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: `${scenario.details.branch}: Currently checked out in this worktree`,
      }),
    ).toBeNull();
  });

  it.each([
    {
      action: 'the initial branch',
      keys: '{Enter}',
      expectedBranch: 'feature/one',
    },
    {
      action: 'the next branch',
      keys: '{ArrowDown}{Enter}',
      expectedBranch: 'feature/two',
    },
    {
      action: 'the wrapped previous branch',
      keys: '{ArrowUp}{Enter}',
      expectedBranch: 'feature/three',
    },
    {
      action: 'the last branch with End',
      keys: '{End}{Enter}',
      expectedBranch: 'feature/three',
    },
    {
      action: 'the first branch with Home',
      keys: '{End}{Home}{Enter}',
      expectedBranch: 'feature/one',
    },
  ])('selects $action with the keyboard', async ({ keys, expectedBranch }) => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderBranchPicker({
      branches: ['feature/one', 'feature/two', 'feature/three'],
      worktrees: [],
      onSelect,
    });

    await user.keyboard(keys);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(expectedBranch);
  });

  it('makes the branch under the pointer the keyboard selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderBranchPicker({
      branches: ['feature/one', 'feature/two', 'feature/three'],
      worktrees: [],
      onSelect,
    });

    await user.hover(screen.getByRole('button', { name: 'feature/three' }));
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('feature/three');
  });

  it('scrolls the keyboard selection into view', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderBranchPicker({
      branches: ['feature/one', 'feature/two', 'feature/three'],
      worktrees: [],
    });

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{End}');

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scrollIntoView.mock.contexts[1]).toBe(
      screen.getByRole('button', { name: 'feature/three' }),
    );
  });

  it('does not scroll when the selection moves under the pointer', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderBranchPicker({
      branches: ['feature/one', 'feature/two', 'feature/three'],
      worktrees: [],
    });

    await user.hover(screen.getByRole('button', { name: 'feature/three' }));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not scroll on a no-op keyboard move', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderBranchPicker({
      branches: ['feature/one'],
      worktrees: [],
    });

    await user.keyboard('{End}');

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps hover scroll-free after a keyboard move', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderBranchPicker({
      branches: ['feature/one', 'feature/two', 'feature/three'],
      worktrees: [],
    });

    await user.keyboard('{ArrowDown}');
    expect(scrollIntoView).toHaveBeenCalledOnce();

    await user.hover(screen.getByRole('button', { name: 'feature/three' }));

    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it('ranks tighter fuzzy matches ahead of scattered ones', async () => {
    const user = userEvent.setup();
    renderBranchPicker({
      branches: ['project-windows', 'win-d-ow', 'x-window-z'],
      worktrees: [],
    });

    const filter = screen.getByRole('textbox', { name: 'Filter branches' });
    await user.type(filter, 'window');

    const options = screen.getAllByRole('button');
    expect(options.map((option) => option.textContent)).toEqual([
      'x-window-z',
      'project-windows',
      'win-d-ow',
    ]);
  });

  it('highlights the matched characters in branch names', async () => {
    const user = userEvent.setup();
    renderBranchPicker({
      branches: ['feature/one', 'feature/two', 'feature/three'],
      worktrees: [],
    });

    const filter = screen.getByRole('textbox', { name: 'Filter branches' });
    await user.type(filter, 'fea');

    const marks = screen.getAllByText('fea', { selector: 'mark' });
    expect(marks).toHaveLength(3);
    for (const mark of marks) expect(mark).toBeVisible();
  });

  it('shows loading and empty-result feedback', () => {
    const { rerender } = render(
      <BranchPicker branches={[]} loading onSelect={() => undefined} />,
    );

    expect(screen.getByText('Loading branches…')).toBeVisible();

    rerender(<BranchPicker branches={[]} onSelect={() => undefined} />);

    expect(screen.getByText('No matching branches')).toBeVisible();
  });
});
