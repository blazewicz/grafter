// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../../../src/renderer/dialogs/SettingsDialog';
import type { Project, Settings } from '../../../src/shared/contracts';
import { projectFactory, settingsFactory } from '../../factories';

const project = projectFactory.build({}, { transient: { withSetupScript: true } });
const settings = settingsFactory.build();

function renderSettingsDialog(
  nextProject: Project = project,
  onClose: () => void = () => undefined,
  onSave: (nextSettings: Settings) => void = () => undefined,
  onProjectSetup: (projectId: string, script: string) => void = () => undefined,
): void {
  render(
    <SettingsDialog
      settings={settings}
      repository={nextProject}
      onClose={onClose}
      onSave={onSave}
      onProjectSetup={onProjectSetup}
    />,
  );
}

describe('SettingsDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the persisted settings and project setup override', () => {
    renderSettingsDialog();

    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Default path' })).toHaveValue(
      settings.defaultWorktreePath,
    );
    expect(screen.getByRole('combobox', { name: 'Date format' })).toHaveValue(
      settings.dateFormat,
    );
    expect(screen.getByRole('combobox', { name: 'Clock' })).toHaveValue(
      settings.timeFormat,
    );
    expect(screen.getByText(/operating system’s regional preferences/)).toBeVisible();
    expect(screen.getByRole('textbox', { name: project.name })).toHaveValue(
      project.setupScript,
    );
  });

  it('closes from the title-bar close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSettingsDialog(project, onClose);

    expect(screen.getByRole('button', { name: 'Close settings' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close settings' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes from the cancel button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSettingsDialog(project, onClose);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('saves edited worktree, date, and time preferences', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();
    const nextSettings = {
      defaultWorktreePath: '../worktrees/<repo_name>',
      dateFormat: 'month-day-year',
      timeFormat: '12-hour',
    } satisfies Settings;
    renderSettingsDialog(project, onClose, onSave);

    const pathInput = screen.getByRole('textbox', { name: 'Default path' });
    const dateSelect = screen.getByRole('combobox', { name: 'Date format' });
    const timeSelect = screen.getByRole('combobox', { name: 'Clock' });

    await user.clear(pathInput);
    await user.type(pathInput, nextSettings.defaultWorktreePath);
    await user.selectOptions(dateSelect, nextSettings.dateFormat);
    await user.selectOptions(timeSelect, nextSettings.timeFormat);

    expect(pathInput).toHaveValue(nextSettings.defaultWorktreePath);
    expect(dateSelect).toHaveValue(nextSettings.dateFormat);
    expect(timeSelect).toHaveValue(nextSettings.timeFormat);
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(nextSettings);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('saves an edited setup override for its project', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onProjectSetup = vi.fn();
    const nextSetupScript = 'pnpm install';
    renderSettingsDialog(project, undefined, onSave, onProjectSetup);

    const setupInput = screen.getByRole('textbox', { name: project.name });
    await user.clear(setupInput);
    await user.type(setupInput, nextSetupScript);

    expect(setupInput).toHaveValue(nextSetupScript);
    const saveSetupButton = screen.getByRole('button', {
      name: `Save setup override for ${project.name}`,
    });
    expect(saveSetupButton).toBeVisible();
    await user.click(saveSetupButton);

    expect(onProjectSetup).toHaveBeenCalledOnce();
    expect(onProjectSetup).toHaveBeenCalledWith(project.id, nextSetupScript);
    expect(onSave).not.toHaveBeenCalled();
  });
});
