// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorktreeList } from '../../../src/renderer/sidebar/WorktreeList';
import type { Project, Worktree, WorktreeStatus } from '../../../src/shared/contracts';
import type { WorktreeSortOrder } from '../../../src/shared/worktree-list';
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
  selectedWorktreeStatus?: WorktreeStatus;
  sortOrder?: WorktreeSortOrder;
  filterQuery?: string;
  onSelect?: (id: string) => void;
  onRemoveWorktree?: (worktree: Worktree) => void;
}

function renderWorktreeList(options: RenderWorktreeListOptions = {}): void {
  render(
    <WorktreeList
      homeDirectory={scenario.homeDirectory}
      project={options.project ?? scenario.repository}
      selectedId={options.selectedId}
      selectedWorktreeStatus={options.selectedWorktreeStatus}
      sortOrder={options.sortOrder ?? 'path'}
      filterQuery={options.filterQuery ?? ''}
      onSelect={options.onSelect ?? (() => undefined)}
      onRemoveWorktree={options.onRemoveWorktree ?? (() => undefined)}
    />,
  );
}

function worktreeButton(worktree: Worktree): HTMLButtonElement {
  return screen.getByRole('button', {
    name: worktree.isMain
      ? `Main worktree, checked out branch ${worktree.branch}`
      : `${worktree.displayName}, checked out branch ${worktree.branch}`,
  });
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

    expect(worktreeButton(expected)).toBeVisible();
    for (const worktree of scenario.expectedWorktrees) {
      if (worktree.id === expected.id) continue;
      expect(
        screen.queryByRole('button', {
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
    expect(screen.queryByRole('button', { name: /checked out branch/ })).toBeNull();
  });

  it('ranks tighter fuzzy matches ahead of scattered ones', () => {
    const { project, tight, scattered } = buildFuzzyProject();

    renderWorktreeList({ project, filterQuery: 'window' });

    expect(worktreeButton(tight)).toBeVisible();
    expect(worktreeButton(scattered)).toBeVisible();
    expect(worktreeButton(tight)).toAppearBefore(worktreeButton(scattered));
  });

  it('highlights the matched characters in worktree names and branches', () => {
    const { project, tight, scattered } = buildFuzzyProject();

    renderWorktreeList({ project, filterQuery: 'window' });

    expect(
      within(worktreeButton(tight)).getByText('window', { selector: 'mark' }),
    ).toBeVisible();
    expect(
      within(worktreeButton(scattered)).getByText('win', { selector: 'mark' }),
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

      let previous: HTMLButtonElement | undefined;
      for (const worktree of expected) {
        const button = worktreeButton(worktree);
        if (previous) expect(previous).toAppearBefore(button);
        previous = button;
      }
    },
  );

  it('shows worktree display name and branch name with a full version in titles', () => {
    renderWorktreeList();

    for (const worktree of scenario.expectedWorktrees) {
      const button = worktreeButton(worktree);

      const displayName = within(button).getByText(worktree.displayName, {
        selector: '[data-worktree-path] > span',
      });
      expect(displayName).toBeVisible();
      expect(displayName.parentElement).toHaveAttribute(
        'title',
        scenario.expectedTooltips[worktree.id] ?? '',
      );

      const branchName = within(button).getByText(worktree.branch, {
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

    const button = worktreeButton(worktree);
    expect(within(button).getByRole('img', { name: 'Dirty worktree' })).toHaveAttribute(
      'title',
      'Uncommitted changes',
    );
    expect(
      within(button).getByRole('img', { name: 'Pull request status: open' }),
    ).toHaveAttribute('title', 'Status: Open');
  });

  it('omits badges when their state is unavailable', () => {
    renderWorktreeList();

    const mainWorktree = scenario.expectedWorktrees.find((worktree) => worktree.isMain);
    if (!mainWorktree) throw new Error('Expected a main worktree.');
    const mainButton = worktreeButton(mainWorktree);
    expect(within(mainButton).queryByLabelText('Worktree badges')).toBeNull();
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

    await user.click(worktreeButton(scenario.selectableWorktree));
    const remove = screen.getByRole('button', {
      name: `Remove ${scenario.selectableWorktree.displayName} worktree`,
    });
    expect(remove).toHaveAttribute('title', 'Remove worktree');
    await user.click(remove);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.selectableWorktree.id);
    expect(onRemoveWorktree).toHaveBeenCalledOnce();
    expect(onRemoveWorktree).toHaveBeenCalledWith(scenario.selectableWorktree);
    expect(screen.queryByRole('button', { name: 'Remove main worktree' })).toBeNull();
  });
});
