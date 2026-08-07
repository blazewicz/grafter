// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppTitlebar } from '../../../src/renderer/shell/AppTitlebar';
import type { Worktree } from '../../../src/shared/contracts';
import { projectFactory, worktreeFactory } from '../../factories';

const project = projectFactory.build();
const worktree = worktreeFactory.build({ projectId: project.id });

interface RenderAppTitlebarOptions {
  repositoryName?: string;
  worktree?: Worktree | undefined;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onSelectRepository?: (() => void) | undefined;
  busy?: boolean;
  onRefresh?: () => void;
}

function renderAppTitlebar(options: RenderAppTitlebarOptions = {}): void {
  render(
    <AppTitlebar
      repositoryName={options.repositoryName ?? project.name}
      worktree={Object.hasOwn(options, 'worktree') ? options.worktree : worktree}
      canGoBack={options.canGoBack ?? false}
      canGoForward={options.canGoForward ?? true}
      onBack={options.onBack ?? (() => undefined)}
      onForward={options.onForward ?? (() => undefined)}
      onSelectRepository={
        Object.hasOwn(options, 'onSelectRepository')
          ? options.onSelectRepository
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

  it('renders repository details with an interactive repository and no worktree context', async () => {
    const user = userEvent.setup();
    const onSelectRepository = vi.fn();
    renderAppTitlebar({
      worktree: undefined,
      onSelectRepository,
    });

    const projectDetails = screen.getByRole('button', { name: project.name });
    expect(projectDetails).toBeVisible();
    expect(projectDetails).toHaveAttribute(
      'title',
      `Open ${project.name} repository details`,
    );
    expect(screen.queryByText(worktree.displayName)).toBeNull();

    await user.click(projectDetails);

    expect(onSelectRepository).toHaveBeenCalledOnce();
  });

  it('renders worktree details with a repository link and worktree context', async () => {
    const user = userEvent.setup();
    const onSelectRepository = vi.fn();
    renderAppTitlebar({ onSelectRepository });

    const projectDetails = screen.getByRole('button', { name: project.name });
    expect(projectDetails).toBeVisible();
    expect(projectDetails).toHaveAttribute(
      'title',
      `Open ${project.name} repository details`,
    );
    expect(screen.getByText(worktree.displayName)).toBeVisible();

    await user.click(projectDetails);

    expect(onSelectRepository).toHaveBeenCalledOnce();
  });

  it('renders a non-interactive fallback when no project is active', () => {
    const fallbackName = 'Worktrees';
    renderAppTitlebar({
      repositoryName: fallbackName,
      worktree: undefined,
      onSelectRepository: undefined,
    });

    expect(screen.getByText(fallbackName)).toBeVisible();
    expect(screen.queryByRole('button', { name: fallbackName })).toBeNull();
    expect(screen.queryByText(project.name)).toBeNull();
    expect(screen.queryByText(worktree.displayName)).toBeNull();
  });

  it('renders its banner and refresh action', () => {
    renderAppTitlebar();

    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh repository' })).toBeVisible();
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
    await user.click(screen.getByRole('button', { name: 'Refresh repository' }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
