// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorktreeRow, worktreeRowId } from '../../../src/renderer/sidebar/WorktreeRow';
import type { Project, Worktree, WorktreeStatus } from '../../../src/shared/contracts';
import { filterWorktrees } from '../../../src/shared/worktree-list';
import {
  mainWorktreeFactory,
  projectConfigFactory,
  projectFactory,
  worktreeFactory,
} from '../../factories';
import { buildRepositoryWorktreesScenario } from '../../scenarios/sidebar/repository-worktrees';

const scenario = buildRepositoryWorktreesScenario();

interface RenderWorktreeRowOptions {
  worktree?: Worktree;
  displayNameIndexes?: readonly number[];
  branchIndexes?: readonly number[];
  selected?: boolean;
  highlighted?: boolean;
  tabbable?: boolean;
  status?: WorktreeStatus;
  onSelect?: (id: string) => void;
  onRemoveWorktree?: (worktree: Worktree) => void;
}

function renderWorktreeRow(options: RenderWorktreeRowOptions = {}): void {
  render(
    <WorktreeRow
      homeDirectory={scenario.homeDirectory}
      mainClonePath={scenario.repository.path}
      worktree={options.worktree ?? scenario.selectableWorktree}
      displayNameIndexes={options.displayNameIndexes ?? []}
      branchIndexes={options.branchIndexes ?? []}
      selected={options.selected ?? false}
      highlighted={options.highlighted ?? false}
      tabbable={options.tabbable ?? true}
      status={options.status}
      onSelect={options.onSelect ?? (() => undefined)}
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

describe('WorktreeRow', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the worktree display name and branch name with full versions in titles', () => {
    for (const worktree of scenario.expectedWorktrees) {
      renderWorktreeRow({ worktree });

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

      cleanup();
    }
  });

  it('highlights the matched characters in the worktree name and branch', () => {
    const { project, tight, scattered } = buildFuzzyProject();
    const matches = filterWorktrees(project.worktrees, 'window');
    const tightMatch = matches.find((match) => match.worktree.id === tight.id);
    const scatteredMatch = matches.find((match) => match.worktree.id === scattered.id);
    if (!tightMatch || !scatteredMatch)
      throw new Error('Expected both worktrees to match.');

    renderWorktreeRow({
      worktree: tight,
      displayNameIndexes: tightMatch.displayNameIndexes,
      branchIndexes: tightMatch.branchIndexes,
    });
    renderWorktreeRow({
      worktree: scattered,
      displayNameIndexes: scatteredMatch.displayNameIndexes,
      branchIndexes: scatteredMatch.branchIndexes,
    });

    expect(
      within(worktreeOption(tight)).getByText('window', { selector: 'mark' }),
    ).toBeVisible();
    expect(
      within(worktreeOption(scattered)).getByText('win', { selector: 'mark' }),
    ).toBeVisible();
  });

  it('does not mark any characters without a filter match', () => {
    renderWorktreeRow();

    expect(screen.queryByText('window', { selector: 'mark' })).toBeNull();
  });

  it('shows available dirty and pull request badges in the worktree top line', () => {
    const worktree = scenario.selectableWorktree;
    renderWorktreeRow({ worktree, selected: true, status: 'dirty' });

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
    const mainWorktree = scenario.expectedWorktrees.find((worktree) => worktree.isMain);
    if (!mainWorktree) throw new Error('Expected a main worktree.');
    renderWorktreeRow({ worktree: mainWorktree });

    expect(screen.queryByLabelText('Worktree badges')).toBeNull();
    expect(screen.queryByRole('img', { name: 'Dirty worktree' })).toBeNull();
  });

  it('selects the worktree on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWorktreeRow({ worktree: scenario.selectableWorktree, onSelect });

    await user.click(worktreeOption(scenario.selectableWorktree));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.selectableWorktree.id);
  });

  it('removes a non-main worktree with its action', async () => {
    const user = userEvent.setup();
    const onRemoveWorktree = vi.fn();
    renderWorktreeRow({ worktree: scenario.selectableWorktree, onRemoveWorktree });

    const remove = screen.getByRole('button', {
      name: `Remove ${scenario.selectableWorktree.displayName} worktree`,
    });
    await user.hover(remove);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Remove worktree');
    await user.click(remove);

    expect(onRemoveWorktree).toHaveBeenCalledOnce();
    expect(onRemoveWorktree).toHaveBeenCalledWith(scenario.selectableWorktree);
  });

  it('does not offer removal for the main worktree', () => {
    const mainWorktree = scenario.expectedWorktrees.find((worktree) => worktree.isMain);
    if (!mainWorktree) throw new Error('Expected a main worktree.');
    renderWorktreeRow({ worktree: mainWorktree });

    expect(screen.queryByRole('button', { name: /Remove .* worktree/ })).toBeNull();
  });

  it('renders the row as a focusable option wired to the listbox', () => {
    renderWorktreeRow({ worktree: scenario.selectableWorktree, tabbable: true });

    const option = worktreeOption(scenario.selectableWorktree);
    expect(option.tagName).toBe('BUTTON');
    expect(option.tabIndex).toBe(0);
    expect(option).toHaveAttribute('id', worktreeRowId(scenario.selectableWorktree.id));
  });

  it('drops the row and its action from the tab order when not tabbable', () => {
    renderWorktreeRow({ worktree: scenario.selectableWorktree, tabbable: false });

    expect(worktreeOption(scenario.selectableWorktree).tabIndex).toBe(-1);
    expect(
      screen.getByRole('button', {
        name: `Remove ${scenario.selectableWorktree.displayName} worktree`,
      }),
    ).toHaveAttribute('tabindex', '-1');
  });

  it('marks the highlighted row separately from the selected row', () => {
    renderWorktreeRow({
      worktree: scenario.selectableWorktree,
      selected: true,
      highlighted: true,
    });

    const option = worktreeOption(scenario.selectableWorktree);
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(option).toHaveAttribute('aria-current', 'page');
  });
});

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
