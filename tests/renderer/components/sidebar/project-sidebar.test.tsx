// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultSidebarWidth,
  ProjectSidebar,
} from '../../../../src/renderer/components/sidebar/ProjectSidebar';
import { api } from '../../../../src/renderer/grafter-api';
import type { Project } from '../../../../src/shared/contracts';
import { buildProjectSidebarScenario } from '../../../scenarios/sidebar/project-sidebar';

const scenario = buildProjectSidebarScenario();

interface RenderProjectSidebarOptions {
  projects?: Project[];
  expanded?: ReadonlySet<string>;
  onToggleProject?: (projectId: string) => void;
  onExpandProject?: (projectId: string) => void;
  onRemoveProject?: (projectId: string) => void;
}

function renderProjectSidebar(options: RenderProjectSidebarOptions = {}): void {
  render(
    <ProjectSidebar
      homeDirectory={scenario.homeDirectory}
      projects={options.projects ?? scenario.projects}
      width={defaultSidebarWidth}
      selectedId={undefined}
      expanded={options.expanded ?? new Set([scenario.secondProject.id])}
      onSelect={() => undefined}
      onToggleProject={options.onToggleProject ?? (() => undefined)}
      onExpandProject={options.onExpandProject ?? (() => undefined)}
      onChooseProject={() => undefined}
      onCreated={() => undefined}
      onRemoveProject={options.onRemoveProject ?? (() => undefined)}
      onRemoveWorktree={() => undefined}
      onOpenSettings={() => undefined}
      onError={() => undefined}
      onResize={() => undefined}
    />,
  );
}

describe('ProjectSidebar', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('composes multiple projects in order with independent expansion state', async () => {
    const user = userEvent.setup();
    const onToggleProject = vi.fn();
    renderProjectSidebar({ onToggleProject });

    const firstProjectButton = screen.getByRole('button', {
      name: scenario.firstProject.name,
    });
    const secondProjectButton = screen.getByRole('button', {
      name: scenario.secondProject.name,
    });
    expect(firstProjectButton).toAppearBefore(secondProjectButton);
    expect(
      screen.getByRole('button', {
        name: `Expand ${scenario.firstProject.name}`,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: `Collapse ${scenario.secondProject.name}`,
      }),
    ).toBeVisible();

    const firstMainWorktree = scenario.firstProject.worktrees[0];
    const secondMainWorktree = scenario.secondProject.worktrees[0];
    if (!firstMainWorktree || !secondMainWorktree) {
      throw new Error('Expected each project to have a main worktree.');
    }
    expect(
      screen.queryByRole('button', {
        name: `Main worktree, checked out branch ${firstMainWorktree.branch}`,
      }),
    ).toBeNull();
    expect(
      screen.getByRole('button', {
        name: `Main worktree, checked out branch ${secondMainWorktree.branch}`,
      }),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: `Expand ${scenario.firstProject.name}`,
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: `Collapse ${scenario.secondProject.name}`,
      }),
    );

    expect(onToggleProject).toHaveBeenCalledTimes(2);
    expect(onToggleProject).toHaveBeenNthCalledWith(1, scenario.firstProject.id);
    expect(onToggleProject).toHaveBeenNthCalledWith(2, scenario.secondProject.id);
  });

  it('binds add and remove actions to the project that owns them', async () => {
    const user = userEvent.setup();
    const listBranches = vi.spyOn(api, 'listBranches').mockResolvedValue([]);
    const onExpandProject = vi.fn();
    const onRemoveProject = vi.fn();
    renderProjectSidebar({ onExpandProject, onRemoveProject });

    await user.click(
      screen.getByRole('button', {
        name: `Add worktree to ${scenario.secondProject.name}`,
      }),
    );

    expect(onExpandProject).toHaveBeenCalledOnce();
    expect(onExpandProject).toHaveBeenCalledWith(scenario.secondProject.id);
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith(scenario.secondProject.id);
    expect(await screen.findByRole('textbox', { name: 'Filter branches' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Filter branches' })).toBeNull();

    await user.click(
      screen.getByRole('button', {
        name: `Remove ${scenario.firstProject.name} from Grafter`,
      }),
    );

    expect(onRemoveProject).toHaveBeenCalledOnce();
    expect(onRemoveProject).toHaveBeenCalledWith(scenario.firstProject.id);
  });
});
