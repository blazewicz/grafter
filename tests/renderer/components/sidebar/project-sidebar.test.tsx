// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultSidebarWidth,
  ProjectSidebar,
} from '../../../../src/renderer/components/sidebar/ProjectSidebar';
import { api } from '../../../../src/renderer/grafter-api';
import type { GrafterApi, Project } from '../../../../src/shared/contracts';
import { buildNewWorktreeScenario } from '../../../scenarios/sidebar/new-worktree';
import { buildProjectSidebarScenario } from '../../../scenarios/sidebar/project-sidebar';

const scenario = buildProjectSidebarScenario();
const newWorktreeScenario = buildNewWorktreeScenario();

interface RenderProjectSidebarOptions {
  projects?: Project[];
  width?: number;
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
  onOpenSettings?: () => void;
  onResize?: (width: number) => void;
}

function renderProjectSidebar(options: RenderProjectSidebarOptions = {}): void {
  render(
    <ProjectSidebar
      homeDirectory={scenario.homeDirectory}
      projects={options.projects ?? scenario.projects}
      width={options.width ?? defaultSidebarWidth}
      selectedId={undefined}
      expanded={options.expanded ?? new Set([scenario.secondProject.id])}
      onSelect={() => undefined}
      onToggleProject={options.onToggleProject ?? (() => undefined)}
      onExpandProject={options.onExpandProject ?? (() => undefined)}
      onChooseProject={options.onChooseProject ?? (() => undefined)}
      onCreated={options.onCreated ?? (() => undefined)}
      onRemoveProject={options.onRemoveProject ?? (() => undefined)}
      onRemoveWorktree={() => undefined}
      onOpenSettings={options.onOpenSettings ?? (() => undefined)}
      onError={() => undefined}
      onResize={options.onResize ?? (() => undefined)}
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

  it('opens the project chooser and settings from the global sidebar actions', async () => {
    const user = userEvent.setup();
    const onChooseProject = vi.fn();
    const onOpenSettings = vi.fn();
    renderProjectSidebar({ onChooseProject, onOpenSettings });

    const addProject = screen.getByRole('button', { name: 'Add Git project' });
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(addProject).toBeVisible();
    expect(settings).toBeVisible();

    await user.click(addProject);
    await user.click(settings);

    expect(onChooseProject).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('opens the project chooser from the empty state', async () => {
    const user = userEvent.setup();
    const onChooseProject = vi.fn();
    renderProjectSidebar({
      projects: [],
      expanded: new Set(),
      onChooseProject,
    });

    expect(screen.getByText('No projects yet')).toBeVisible();
    expect(screen.getByText('Add the main clone of a Git repository.')).toBeVisible();
    const addProject = screen.getByRole('button', { name: 'Add project' });
    expect(addProject).toBeVisible();
    await user.click(addProject);

    expect(onChooseProject).toHaveBeenCalledOnce();
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
    renderProjectSidebar({ width, onResize });

    const resizeHandle = screen.getByRole('separator', {
      name: 'Resize projects sidebar',
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
    renderProjectSidebar({ width: 360, onResize });

    await user.dblClick(
      screen.getByRole('separator', { name: 'Resize projects sidebar' }),
    );

    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(defaultSidebarWidth);
  });

  it('resizes the sidebar by dragging its handle', async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    renderProjectSidebar({ onResize });

    const resizeHandle = screen.getByRole('separator', {
      name: 'Resize projects sidebar',
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
    renderProjectSidebar({
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
