// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppTitlebar } from '../../../../src/renderer/components/shell/AppTitlebar';
import type { Worktree } from '../../../../src/shared/contracts';
import { projectFactory, worktreeFactory } from '../../../factories';

const project = projectFactory.build();
const worktree = worktreeFactory.build({ projectId: project.id });

interface RenderAppTitlebarOptions {
  projectName?: string;
  worktree?: Worktree | undefined;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onSelectProject?: (() => void) | undefined;
  busy?: boolean;
  onRefresh?: () => void;
}

function renderAppTitlebar(options: RenderAppTitlebarOptions = {}): void {
  render(
    <AppTitlebar
      projectName={options.projectName ?? project.name}
      worktree={Object.hasOwn(options, 'worktree') ? options.worktree : worktree}
      canGoBack={options.canGoBack ?? false}
      canGoForward={options.canGoForward ?? true}
      onBack={options.onBack ?? (() => undefined)}
      onForward={options.onForward ?? (() => undefined)}
      onSelectProject={
        Object.hasOwn(options, 'onSelectProject')
          ? options.onSelectProject
          : () => undefined
      }
      busy={options.busy ?? false}
      onRefresh={options.onRefresh ?? (() => undefined)}
    />,
  );
}

describe('AppTitlebar', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders project details with an interactive project and no worktree context', async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();
    renderAppTitlebar({
      worktree: undefined,
      onSelectProject,
    });

    const projectDetails = screen.getByRole('button', { name: project.name });
    expect(projectDetails).toBeVisible();
    expect(projectDetails).toHaveAttribute(
      'title',
      `Open ${project.name} project details`,
    );
    expect(screen.queryByText(worktree.displayName)).toBeNull();

    await user.click(projectDetails);

    expect(onSelectProject).toHaveBeenCalledOnce();
  });

  it('renders worktree details with a project link and worktree context', async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();
    renderAppTitlebar({ onSelectProject });

    const projectDetails = screen.getByRole('button', { name: project.name });
    expect(projectDetails).toBeVisible();
    expect(projectDetails).toHaveAttribute(
      'title',
      `Open ${project.name} project details`,
    );
    expect(screen.getByText(worktree.displayName)).toBeVisible();

    await user.click(projectDetails);

    expect(onSelectProject).toHaveBeenCalledOnce();
  });

  it('renders a non-interactive fallback when no project is active', () => {
    const fallbackName = 'Worktrees';
    renderAppTitlebar({
      projectName: fallbackName,
      worktree: undefined,
      onSelectProject: undefined,
    });

    expect(screen.getByText(fallbackName)).toBeVisible();
    expect(screen.queryByRole('button', { name: fallbackName })).toBeNull();
    expect(screen.queryByText(project.name)).toBeNull();
    expect(screen.queryByText(worktree.displayName)).toBeNull();
  });

  it('keeps refresh while omitting duplicate branding and settings', () => {
    renderAppTitlebar();

    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh repositories' })).toBeVisible();
    expect(screen.queryByText('Grafter')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull();
  });

  it('exposes history availability through its navigation controls', () => {
    renderAppTitlebar();

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Forward' })).toBeEnabled();
  });

  it('invokes each titlebar action once', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onForward = vi.fn();
    const onRefresh = vi.fn();
    renderAppTitlebar({
      canGoBack: true,
      onBack,
      onForward,
      onRefresh,
    });

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Forward' }));
    await user.click(screen.getByRole('button', { name: 'Refresh repositories' }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
