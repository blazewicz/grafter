// @vitest-environment happy-dom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
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

  it('leaves closing to the traffic lights instead of rendering its own button', () => {
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose: vi.fn(),
      onError: () => undefined,
    });

    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('closes with a window-level Escape even when focus is not in the viewer', () => {
    const onClose = vi.fn();
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });

    fireEvent.keyDown(window, { key: 'Escape' });

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

  it('closes the commit viewer with Escape while its inline details are visible', () => {
    const onClose = vi.fn();
    renderDiffViewer(scenario.commitSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });
    expect(screen.getByLabelText('Commit details')).toBeVisible();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
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

  it('does not close on mouse-down inside the viewer surface', () => {
    const onClose = vi.fn();
    const { container } = renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose,
      onError: () => undefined,
    });
    const surface = container.firstElementChild;
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected the diff viewer surface.');
    }

    fireEvent.mouseDown(surface);

    expect(onClose).not.toHaveBeenCalled();
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
