// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectRemovalDialog } from '../../../../src/renderer/components/dialogs/ProjectRemovalDialog';
import { projectFactory } from '../../../factories';

const project = projectFactory.build();

function renderProjectRemovalDialog(
  busy = false,
  onCancel: () => void = () => undefined,
  onConfirm: () => void = () => undefined,
): void {
  render(
    <ProjectRemovalDialog
      projectName={project.name}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
}

describe('ProjectRemovalDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('explains that removal leaves the repository and worktrees on disk', () => {
    renderProjectRemovalDialog();

    expect(
      screen.getByRole('dialog', {
        name: `Remove “${project.name}” from Grafter?`,
      }),
    ).toHaveAttribute('aria-modal', 'true');
    expect(
      screen.getByText(
        'Grafter will remove this project from the sidebar. The repository and its worktrees will remain on disk.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove project' })).toBeEnabled();
  });

  it('cancels project removal', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderProjectRemovalDialog(false, onCancel, onConfirm);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms project removal', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderProjectRemovalDialog(false, onCancel, onConfirm);

    expect(screen.getByRole('button', { name: 'Remove project' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove project' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables both actions while removal is in progress', () => {
    renderProjectRemovalDialog(true);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove project' })).toBeDisabled();
  });
});
