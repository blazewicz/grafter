// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectNode } from '../../../../src/renderer/components/sidebar/ProjectNode';
import type { GrafterApi, Project, Worktree } from '../../../../src/shared/contracts';
import { buildProjectNodeScenario } from '../../../scenarios/sidebar/project-node';

const scenario = buildProjectNodeScenario();

interface RenderProjectNodeOptions {
  project?: Project;
  expanded?: boolean;
  selectedId?: string;
  adding?: boolean;
  onToggle?: () => void;
  onSelect?: (id: string) => void;
  onAdd?: () => void;
  onCancelAdd?: () => void;
  onCreated?: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveProject?: () => void;
  onRemoveWorktree?: (worktree: Worktree) => void;
  onError?: (message: string) => void;
}

function renderProjectNode(options: RenderProjectNodeOptions = {}): void {
  render(
    <ProjectNode
      homeDirectory={scenario.homeDirectory}
      project={options.project ?? scenario.project}
      expanded={options.expanded ?? true}
      selectedId={options.selectedId}
      adding={options.adding ?? false}
      onToggle={options.onToggle ?? (() => undefined)}
      onSelect={options.onSelect ?? (() => undefined)}
      onAdd={options.onAdd ?? (() => undefined)}
      onCancelAdd={options.onCancelAdd ?? (() => undefined)}
      onCreated={options.onCreated ?? (() => undefined)}
      onRemoveProject={options.onRemoveProject ?? (() => undefined)}
      onRemoveWorktree={options.onRemoveWorktree ?? (() => undefined)}
      onError={options.onError ?? (() => undefined)}
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

describe('ProjectNode', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows expanded worktrees in display order with their branch labels', () => {
    renderProjectNode();

    let previousButton: HTMLButtonElement | undefined;
    for (const worktree of scenario.expectedWorktrees) {
      const currentButton = worktreeButton(worktree);
      if (previousButton) expect(previousButton).toAppearBefore(currentButton);
      previousButton = currentButton;
    }

    const mainWorktree = scenario.expectedWorktrees.find((worktree) => worktree.isMain);
    if (!mainWorktree) throw new Error('Expected a main worktree in the scenario.');
    const mainButton = worktreeButton(mainWorktree);
    expect(within(mainButton).getAllByText('main')).toHaveLength(1);
    for (const worktree of scenario.expectedWorktrees) {
      const button = worktreeButton(worktree);
      expect(within(button).getByText(worktree.displayName)).toBeVisible();
      if (!worktree.isMain) {
        expect(within(button).getByText(worktree.branch)).toBeVisible();
      }
    }
  });

  it('shows a non-default branch label for the main worktree', () => {
    const branch = 'release/from-main';
    const project = {
      ...scenario.project,
      worktrees: scenario.project.worktrees.map((worktree) =>
        worktree.isMain ? { ...worktree, branch } : worktree,
      ),
    };
    renderProjectNode({ project });

    expect(
      within(
        screen.getByRole('button', {
          name: `Main worktree, checked out branch ${branch}`,
        }),
      ).getByText(branch),
    ).toBeVisible();
  });

  it('shows each worktree path in a tooltip', async () => {
    const user = userEvent.setup();
    renderProjectNode();

    for (const worktree of scenario.expectedWorktrees) {
      const expectedTooltip = scenario.expectedTooltips[worktree.id];
      if (!expectedTooltip) {
        throw new Error(`Expected a tooltip for ${worktree.displayName}.`);
      }
      await user.hover(within(worktreeButton(worktree)).getByText(worktree.displayName));
      expect(await screen.findByRole('tooltip')).toHaveTextContent(expectedTooltip);
      await user.unhover(
        within(worktreeButton(worktree)).getByText(worktree.displayName),
      );
      expect(screen.queryByRole('tooltip')).toBeNull();
    }
  });

  it('exposes project and worktree actions with their exact callback values', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const onRemoveProject = vi.fn();
    const onRemoveWorktree = vi.fn();
    renderProjectNode({
      onToggle,
      onSelect,
      onAdd,
      onRemoveProject,
      onRemoveWorktree,
    });

    await user.click(
      screen.getByRole('button', { name: `Collapse ${scenario.project.name}` }),
    );
    await user.click(screen.getByRole('button', { name: scenario.project.name }));
    await user.click(
      screen.getByRole('button', {
        name: `Add worktree to ${scenario.project.name}`,
      }),
    );
    const removeProject = screen.getByRole('button', {
      name: `Remove ${scenario.project.name} from Grafter`,
    });
    expect(removeProject).toHaveAttribute('aria-haspopup', 'dialog');
    expect(removeProject).toHaveAttribute('title', 'Remove from Grafter');
    await user.click(removeProject);
    await user.click(worktreeButton(scenario.selectableWorktree));
    await user.click(
      screen.getByRole('button', {
        name: `Remove ${scenario.selectableWorktree.displayName} worktree`,
      }),
    );

    expect(onToggle).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, scenario.project.id);
    expect(onSelect).toHaveBeenNthCalledWith(2, scenario.selectableWorktree.id);
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onRemoveProject).toHaveBeenCalledOnce();
    expect(onRemoveWorktree).toHaveBeenCalledOnce();
    expect(onRemoveWorktree).toHaveBeenCalledWith(scenario.selectableWorktree);
  });

  it('keeps main-worktree removal unavailable', () => {
    renderProjectNode();

    expect(screen.queryByRole('button', { name: 'Remove main worktree' })).toBeNull();
    const removableWorktrees = scenario.expectedWorktrees.filter(
      (worktree) => !worktree.isMain,
    );
    expect(screen.getAllByRole('button', { name: /^Remove .+ worktree$/ })).toHaveLength(
      removableWorktrees.length,
    );
    for (const displayName of new Set(
      removableWorktrees.map((worktree) => worktree.displayName),
    )) {
      expect(
        screen.getAllByRole('button', {
          name: `Remove ${displayName} worktree`,
        }),
      ).toHaveLength(
        removableWorktrees.filter((worktree) => worktree.displayName === displayName)
          .length,
      );
    }
  });

  it('hides worktrees and the add form while collapsed', () => {
    renderProjectNode({ expanded: false, adding: true });

    expect(
      screen.getByRole('button', { name: `Expand ${scenario.project.name}` }),
    ).toBeVisible();
    for (const worktree of scenario.expectedWorktrees) {
      expect(
        screen.queryByRole('button', {
          name: worktree.isMain
            ? `Main worktree, checked out branch ${worktree.branch}`
            : `${worktree.displayName}, checked out branch ${worktree.branch}`,
        }),
      ).toBeNull();
    }
    expect(screen.queryByRole('textbox', { name: 'Filter branches' })).toBeNull();
  });
});
