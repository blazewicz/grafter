// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorktreeList, worktreeRowId } from '../../../src/renderer/sidebar/WorktreeList';
import type { Project, Worktree, WorktreeStatus } from '../../../src/shared/contracts';
import {
  filterWorktrees,
  sortWorktrees,
  type WorktreeSortOrder,
} from '../../../src/shared/worktree-list';
import {
  mainWorktreeFactory,
  projectConfigFactory,
  projectFactory,
  worktreeFactory,
} from '../../factories';
import { buildRepositoryWorktreesScenario } from '../../scenarios/sidebar/repository-worktrees';

const scenario = buildRepositoryWorktreesScenario();

interface RenderWorktreeListOptions {
  project?: Project;
  selectedId?: string;
  highlightedId?: string;
  selectedWorktreeStatus?: WorktreeStatus;
  sortOrder?: WorktreeSortOrder;
  filterQuery?: string;
  onSelect?: (id: string) => void;
  onHighlight?: (id: string | undefined) => void;
  onRemoveWorktree?: (worktree: Worktree) => void;
}

function renderWorktreeList(options: RenderWorktreeListOptions = {}): void {
  const project = options.project ?? scenario.repository;
  const visibleWorktrees = filterWorktrees(
    sortWorktrees(project.worktrees, options.sortOrder ?? 'path'),
    options.filterQuery ?? '',
  );
  render(
    <WorktreeList
      homeDirectory={scenario.homeDirectory}
      project={project}
      visibleWorktrees={visibleWorktrees}
      selectedId={options.selectedId}
      highlightedId={options.highlightedId}
      selectedWorktreeStatus={options.selectedWorktreeStatus}
      filterQuery={options.filterQuery ?? ''}
      listRef={createRef<HTMLDivElement>()}
      onSelect={options.onSelect ?? (() => undefined)}
      onHighlight={options.onHighlight ?? (() => undefined)}
      onRemoveWorktree={options.onRemoveWorktree ?? (() => undefined)}
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

function worktreeListbox(): HTMLElement {
  return screen.getByRole('listbox', { name: `${scenario.repository.name} worktrees` });
}

function expectedWorktreeAt(index: number): Worktree {
  const worktree = scenario.expectedWorktrees[index];
  if (!worktree) throw new Error(`Expected a worktree at index ${index}.`);
  return worktree;
}

function InteractiveWorktreeList({
  selectedId,
  onSelect = () => undefined,
  onRemoveWorktree = () => undefined,
}: {
  selectedId?: string;
  onSelect?: (id: string) => void;
  onRemoveWorktree?: (worktree: Worktree) => void;
}): React.JSX.Element {
  const [highlightedId, setHighlightedId] = useState<string | undefined>(selectedId);
  const visibleWorktrees = filterWorktrees(
    sortWorktrees(scenario.repository.worktrees, 'path'),
    '',
  );
  return (
    <WorktreeList
      homeDirectory={scenario.homeDirectory}
      project={scenario.repository}
      visibleWorktrees={visibleWorktrees}
      selectedId={selectedId}
      highlightedId={highlightedId}
      selectedWorktreeStatus={undefined}
      filterQuery=""
      listRef={createRef<HTMLDivElement>()}
      onHighlight={setHighlightedId}
      onSelect={onSelect}
      onRemoveWorktree={onRemoveWorktree}
    />
  );
}

function buildFuzzyProject(): { project: Project; tight: Worktree; scattered: Worktree } {
  const projectId = 'grafter';
  const projectConfig = projectConfigFactory.build({
    id: projectId,
    name: projectId,
    path: `/Users/developer/Code/${projectId}`,
  });
  const mainWorktree = mainWorktreeFactory.build({
    id: `${projectId}:main`,
    projectId,
    path: projectConfig.path,
  });
  const tight = worktreeFactory.build({
    id: `${projectId}:tight`,
    projectId,
    displayName: 'project-windows',
    path: `/Users/developer/Code/${projectId}.worktrees/project-windows`,
    branch: 'feature/win',
  });
  const scattered = worktreeFactory.build({
    id: `${projectId}:scattered`,
    projectId,
    displayName: 'win-d-ow',
    path: `/Users/developer/Code/${projectId}.worktrees/win-d-ow`,
    branch: 'feature/x',
  });
  return {
    project: projectFactory.build(projectConfig, {
      associations: { worktrees: [mainWorktree, tight, scattered] },
    }),
    tight,
    scattered,
  };
}

describe('WorktreeList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    {
      field: 'path',
      query: scenario.pathFilterWorktree.path.toLocaleUpperCase(),
      expected: scenario.pathFilterWorktree,
    },
    {
      field: 'branch',
      query: scenario.branchFilterWorktree.branch.toLocaleUpperCase(),
      expected: scenario.branchFilterWorktree,
    },
  ])('filters worktrees case-insensitively by $field', ({ query, expected }) => {
    renderWorktreeList({ filterQuery: query });

    expect(worktreeOption(expected)).toBeVisible();
    for (const worktree of scenario.expectedWorktrees) {
      if (worktree.id === expected.id) continue;
      expect(
        screen.queryByRole('option', {
          name: worktree.isMain
            ? `Main worktree, checked out branch ${worktree.branch}`
            : `${worktree.displayName}, checked out branch ${worktree.branch}`,
        }),
      ).toBeNull();
    }
  });

  it('shows an empty result for a filter with no matching path or branch', () => {
    const query = 'missing-worktree-filter';
    renderWorktreeList({ filterQuery: query });

    expect(screen.getByRole('status')).toHaveTextContent(`No worktrees match “${query}”`);
    expect(screen.queryByRole('option', { name: /checked out branch/ })).toBeNull();
  });

  it('ranks tighter fuzzy matches ahead of scattered ones', () => {
    const { project, tight, scattered } = buildFuzzyProject();

    renderWorktreeList({ project, filterQuery: 'window' });

    expect(worktreeOption(tight)).toBeVisible();
    expect(worktreeOption(scattered)).toBeVisible();
    expect(worktreeOption(tight)).toAppearBefore(worktreeOption(scattered));
  });

  it('highlights the matched characters in worktree names and branches', () => {
    const { project, tight, scattered } = buildFuzzyProject();

    renderWorktreeList({ project, filterQuery: 'window' });

    expect(
      within(worktreeOption(tight)).getByText('window', { selector: 'mark' }),
    ).toBeVisible();
    expect(
      within(worktreeOption(scattered)).getByText('win', { selector: 'mark' }),
    ).toBeVisible();

    cleanup();
    renderWorktreeList({ project });

    expect(screen.queryByText('window', { selector: 'mark' })).toBeNull();
  });

  it.each([{ sortOrder: 'path' as const }, { sortOrder: 'branch' as const }])(
    'shows worktrees sorted by $sortOrder',
    ({ sortOrder }) => {
      renderWorktreeList({ sortOrder });

      const expected =
        sortOrder === 'path'
          ? scenario.expectedWorktrees
          : scenario.expectedWorktreesByBranch;

      let previous: HTMLElement | undefined;
      for (const worktree of expected) {
        const option = worktreeOption(worktree);
        if (previous) expect(previous).toAppearBefore(option);
        previous = option;
      }
    },
  );

  it('shows worktree display name and branch name with a full version in titles', () => {
    renderWorktreeList();

    for (const worktree of scenario.expectedWorktrees) {
      const option = worktreeOption(worktree);

      const displayName = within(option).getByText(worktree.displayName, {
        selector: '[data-worktree-path] > span',
      });
      expect(displayName).toBeVisible();
      expect(displayName.parentElement).toHaveAttribute(
        'title',
        scenario.expectedTooltips[worktree.id] ?? '',
      );

      const branchName = within(option).getByText(worktree.branch, {
        selector: '[data-branch-name] > span',
      });
      expect(branchName).toBeVisible();
      expect(branchName.parentElement).toHaveAttribute('title', worktree.branch);
    }
  });

  it('shows available dirty and pull request badges in the worktree top line', () => {
    const worktree = scenario.selectableWorktree;
    renderWorktreeList({
      selectedId: worktree.id,
      selectedWorktreeStatus: 'dirty',
    });

    const option = worktreeOption(worktree);
    expect(within(option).getByRole('img', { name: 'Dirty worktree' })).toHaveAttribute(
      'title',
      'Uncommitted changes',
    );
    expect(
      within(option).getByRole('img', { name: 'Pull request status: open' }),
    ).toHaveAttribute('title', 'Status: Open');
  });

  it('omits badges when their state is unavailable', () => {
    renderWorktreeList();

    const mainWorktree = scenario.expectedWorktrees.find((worktree) => worktree.isMain);
    if (!mainWorktree) throw new Error('Expected a main worktree.');
    const mainOption = worktreeOption(mainWorktree);
    expect(within(mainOption).queryByLabelText('Worktree badges')).toBeNull();
    expect(screen.queryByRole('img', { name: 'Dirty worktree' })).toBeNull();
  });

  it('selects a row and removes only a non-main worktree', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onRemoveWorktree = vi.fn();
    renderWorktreeList({
      selectedId: scenario.selectableWorktree.id,
      onSelect,
      onRemoveWorktree,
    });

    await user.click(worktreeOption(scenario.selectableWorktree));
    const remove = screen.getByRole('button', {
      name: `Remove ${scenario.selectableWorktree.displayName} worktree`,
    });
    await user.hover(remove);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Remove worktree');
    await user.click(remove);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.selectableWorktree.id);
    expect(onRemoveWorktree).toHaveBeenCalledOnce();
    expect(onRemoveWorktree).toHaveBeenCalledWith(scenario.selectableWorktree);
    expect(screen.queryByRole('button', { name: 'Remove main worktree' })).toBeNull();
  });

  it('moves the highlighted option with arrow keys and wraps around', async () => {
    const user = userEvent.setup();
    render(<InteractiveWorktreeList selectedId={expectedWorktreeAt(0).id} />);

    worktreeListbox().focus();
    await user.keyboard('{ArrowDown}');
    expect(worktreeOption(expectedWorktreeAt(1))).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{ArrowUp}');
    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{ArrowUp}');
    expect(
      worktreeOption(expectedWorktreeAt(scenario.expectedWorktrees.length - 1)),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('starts navigation from the first option when nothing is highlighted', async () => {
    const user = userEvent.setup();
    render(<InteractiveWorktreeList />);

    worktreeListbox().focus();
    await user.keyboard('{ArrowDown}');

    expect(worktreeOption(expectedWorktreeAt(0))).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('jumps to the first and last option with Home and End', async () => {
    const user = userEvent.setup();
    render(<InteractiveWorktreeList selectedId={expectedWorktreeAt(1).id} />);

    worktreeListbox().focus();
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

  it('commits the highlighted option with Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <InteractiveWorktreeList
        selectedId={expectedWorktreeAt(0).id}
        onSelect={onSelect}
      />,
    );

    worktreeListbox().focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(expectedWorktreeAt(1).id);
  });

  it('commits the first option with Enter when nothing is highlighted', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<InteractiveWorktreeList onSelect={onSelect} />);

    worktreeListbox().focus();
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(expectedWorktreeAt(0).id);
  });

  it('points the listbox at the highlighted option and marks it selected', () => {
    renderWorktreeList({ highlightedId: scenario.selectableWorktree.id });

    expect(worktreeListbox()).toHaveAttribute(
      'aria-activedescendant',
      worktreeRowId(scenario.selectableWorktree.id),
    );
    expect(worktreeOption(scenario.selectableWorktree)).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('restores the highlight to the selection and blurs on Escape', async () => {
    const user = userEvent.setup();
    const onHighlight = vi.fn();
    renderWorktreeList({
      selectedId: scenario.selectableWorktree.id,
      highlightedId: expectedWorktreeAt(0).id,
      onHighlight,
    });

    const listbox = worktreeListbox();
    listbox.focus();
    await user.keyboard('{Escape}');

    expect(onHighlight).toHaveBeenCalledOnce();
    expect(onHighlight).toHaveBeenCalledWith(scenario.selectableWorktree.id);
    expect(listbox).not.toHaveFocus();
  });

  it('keeps keyboard navigation inside the list while focused on a row action', async () => {
    const user = userEvent.setup();
    const onHighlight = vi.fn();
    const onSelect = vi.fn();
    const onRemoveWorktree = vi.fn();
    renderWorktreeList({
      selectedId: scenario.selectableWorktree.id,
      highlightedId: scenario.selectableWorktree.id,
      onSelect,
      onHighlight,
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
    expect(onHighlight).not.toHaveBeenCalled();
  });
});
