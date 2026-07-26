// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BranchPicker } from '../../../../src/renderer/components/branches/BranchPicker';
import type { Worktree } from '../../../../src/shared/contracts';
import { buildBranchSwitchScenario } from '../../../scenarios/details/branch-switch';

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

  it('shows loading and empty-result feedback', () => {
    const { rerender } = render(
      <BranchPicker branches={[]} loading onSelect={() => undefined} />,
    );

    expect(screen.getByText('Loading branches…')).toBeVisible();

    rerender(<BranchPicker branches={[]} onSelect={() => undefined} />);

    expect(screen.getByText('No matching branches')).toBeVisible();
  });
});
