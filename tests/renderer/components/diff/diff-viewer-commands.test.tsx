// @vitest-environment happy-dom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../../src/renderer/grafter-api';
import {
  installDiffViewerObservers,
  type IntersectionObserverHarness,
  renderDiffViewer,
  scenario,
} from './diff-viewer-test-harness';

let intersectionObservers: IntersectionObserverHarness;

describe('DiffViewer commands', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    cleanup();
    intersectionObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('closes from the close button exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });

    await user.click(screen.getByRole('button', { name: 'Close diff viewer' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('prevents native cancel dismissal and requests a close exactly once', () => {
    const onClose = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });
    const dialog = screen.getByRole('dialog', {
      name: `Committed changes from ${scenario.branches.source} against ${scenario.branches.target}`,
    });
    const cancelEvent = new Event('cancel', { cancelable: true });

    fireEvent(dialog, cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes the innermost branch picker before closing the viewer with Escape', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches.available);
    const openBranchDiff = vi.spyOn(api, 'openBranchDiff');
    const onClose = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });
    const sourceButton = screen.getByRole('button', { name: 'Choose source branch' });

    await user.click(sourceButton);
    expect(screen.getByRole('dialog', { name: 'Choose source branch' })).toBeVisible();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Choose source branch' })).toBeNull();
    expect(sourceButton).toHaveAttribute('aria-expanded', 'false');
    expect(openBranchDiff).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes commit details before closing the viewer with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDiffViewer(scenario.commitSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });
    const detailsButton = screen.getByRole('button', { name: 'Show commit details' });

    await user.click(detailsButton);
    expect(screen.getByLabelText('Commit details')).toBeVisible();

    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('Commit details')).toBeNull();
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the viewer with Escape when no nested surface is open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on backdrop mouse-down but not inner-surface mouse-down', () => {
    const onClose = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });
    const dialog = screen.getByRole('dialog', {
      name: `Committed changes from ${scenario.branches.source} against ${scenario.branches.target}`,
    });
    const surface = dialog.firstElementChild;
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected the diff viewer inner surface.');
    }

    fireEvent.mouseDown(surface);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(dialog);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes the editor picker with Escape without closing the viewer', async () => {
    const user = userEvent.setup();
    const file = scenario.files.modified;
    const onClose = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });
    const pickerButton = screen.getByRole('button', {
      name: `Choose IDE for ${file.path}`,
    });

    await user.click(pickerButton);
    expect(screen.getByRole('menu')).toBeVisible();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(pickerButton).toHaveAttribute('aria-expanded', 'false');
    expect(onClose).not.toHaveBeenCalled();
  });
});
