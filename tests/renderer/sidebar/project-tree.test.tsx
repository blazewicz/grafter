// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectTree } from '../../../src/renderer/sidebar/ProjectTree';
import { api } from '../../../src/renderer/grafter-api';
import type { GrafterApi, Project } from '../../../src/shared/contracts';
import { buildNewWorktreeScenario } from '../../scenarios/sidebar/new-worktree';
import { buildSidebarScenario } from '../../scenarios/sidebar/sidebar';

const scenario = buildSidebarScenario();
const newWorktreeScenario = buildNewWorktreeScenario();

interface RenderProjectTreeOptions {
  projects?: Project[];
  expanded?: ReadonlySet<string>;
  onToggleProject?: (projectId: string) => void;
  onExpandProject?: (projectId: string) => void;
  onChooseProject?: () => void;
  onCreated?: (
    projectId: string,
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveProject?: (projectId: string) => void;
}

function renderProjectTree(options: RenderProjectTreeOptions = {}): void {
  render(
    <ProjectTree
      homeDirectory={scenario.homeDirectory}
      projects={options.projects ?? scenario.projects}
      selectedId={undefined}
      expanded={options.expanded ?? new Set([scenario.secondProject.id])}
      onSelect={() => undefined}
      onToggleProject={options.onToggleProject ?? (() => undefined)}
      onExpandProject={options.onExpandProject ?? (() => undefined)}
      onChooseProject={options.onChooseProject ?? (() => undefined)}
      onCreated={options.onCreated ?? (() => undefined)}
      onRemoveProject={options.onRemoveProject ?? (() => undefined)}
      onRemoveWorktree={() => undefined}
      onError={() => undefined}
    />,
  );
}

describe('ProjectTree', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('composes multiple projects in order with independent expansion state', async () => {
    const user = userEvent.setup();
    const onToggleProject = vi.fn();
    renderProjectTree({ onToggleProject });

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
    renderProjectTree({ onExpandProject, onRemoveProject });

    await user.click(
      screen.getByRole('button', {
        name: `Add worktree to ${scenario.secondProject.name}`,
      }),
    );

    expect(onExpandProject).toHaveBeenCalledOnce();
    expect(onExpandProject).toHaveBeenCalledWith(scenario.secondProject.id);
    expect(listBranches).toHaveBeenCalledOnce();
    expect(listBranches).toHaveBeenCalledWith();
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

  it('opens the project chooser from the heading actions', async () => {
    const user = userEvent.setup();
    const onChooseProject = vi.fn();
    renderProjectTree({ onChooseProject });

    const addProject = screen.getByRole('button', { name: 'Open Repository...' });
    expect(addProject).toBeVisible();

    await user.click(addProject);

    expect(onChooseProject).toHaveBeenCalledOnce();
  });

  it('opens the project chooser from the empty state', async () => {
    const user = userEvent.setup();
    const onChooseProject = vi.fn();
    renderProjectTree({
      projects: [],
      expanded: new Set(),
      onChooseProject,
    });

    expect(screen.getByText('No projects yet')).toBeVisible();
    expect(
      screen.getByText('Add a Git repository from any of its worktrees.'),
    ).toBeVisible();
    const openActions = screen.getAllByRole('button', { name: 'Open Repository...' });
    const addProject = openActions.at(-1);
    if (!addProject) throw new Error('Expected an empty-state repository action.');
    expect(addProject).toBeVisible();
    await user.click(addProject);

    expect(onChooseProject).toHaveBeenCalledOnce();
  });

  it('publishes a created worktree for the project that owns the form', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(newWorktreeScenario.branches);
    vi.spyOn(api, 'suggestWorktreePath').mockResolvedValue(
      newWorktreeScenario.suggestedPath,
    );
    const createWorktree = vi
      .spyOn(api, 'createWorktree')
      .mockResolvedValue(newWorktreeScenario.createdResult);
    const onCreated = vi.fn();
    renderProjectTree({
      projects: [newWorktreeScenario.project],
      expanded: new Set([newWorktreeScenario.project.id]),
      onCreated,
    });

    await user.click(
      screen.getByRole('button', {
        name: `Add worktree to ${newWorktreeScenario.project.name}`,
      }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: newWorktreeScenario.availableBranch,
      }),
    );
    const pathInput = await screen.findByRole('textbox', { name: 'Path' });
    await waitFor(() => {
      expect(pathInput).toHaveValue(newWorktreeScenario.suggestedPath);
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(createWorktree).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledOnce();
    });
    expect(onCreated).toHaveBeenCalledWith(
      newWorktreeScenario.project.id,
      newWorktreeScenario.createdResult,
      { path: newWorktreeScenario.suggestedPath },
    );
    expect(screen.queryByRole('textbox', { name: 'Filter branches' })).toBeNull();
  });
});
