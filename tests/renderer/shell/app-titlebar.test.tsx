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

  it('renders repository name without worktree when worktree is undefined', () => {
    renderAppTitlebar({ worktree: undefined });

    expect(screen.getByText(project.name)).toBeVisible();
    expect(screen.queryByRole('button', { name: project.name })).toBeNull();
    expect(screen.queryByText(worktree.displayName)).toBeNull();
  });

  it('renders repository name and worktree displayName when worktree is present', () => {
    renderAppTitlebar();

    expect(screen.getByText(project.name)).toBeVisible();
    expect(screen.getByText(worktree.displayName)).toBeVisible();
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
