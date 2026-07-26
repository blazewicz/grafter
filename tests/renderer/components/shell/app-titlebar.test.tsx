// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppTitlebar } from '../../../../src/renderer/components/shell/AppTitlebar';
import type { Worktree } from '../../../../src/shared/contracts';
import { worktreeFactory } from '../../../factories';

const worktree = worktreeFactory.build();

interface RenderAppTitlebarOptions {
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
      projectName={worktree.projectId}
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

  it('keeps repository context and refresh while omitting duplicate branding and settings', () => {
    renderAppTitlebar();

    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('button', { name: worktree.projectId })).toHaveAttribute(
      'title',
      `Open ${worktree.projectId} project details`,
    );
    expect(screen.getByText(worktree.displayName)).toBeVisible();
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
    const onSelectProject = vi.fn();
    const onRefresh = vi.fn();
    renderAppTitlebar({
      canGoBack: true,
      onBack,
      onForward,
      onSelectProject,
      onRefresh,
    });

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Forward' }));
    await user.click(screen.getByRole('button', { name: worktree.projectId }));
    await user.click(screen.getByRole('button', { name: 'Refresh repositories' }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();
    expect(onSelectProject).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('shows project-only context without making the project interactive', () => {
    renderAppTitlebar({
      worktree: undefined,
      onSelectProject: undefined,
    });

    expect(screen.getByText(worktree.projectId)).toBeVisible();
    expect(screen.queryByRole('button', { name: worktree.projectId })).toBeNull();
    expect(screen.queryByText(worktree.displayName)).toBeNull();
  });
});
