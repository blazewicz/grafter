// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DiffFileContextMenu,
  type DiffFileContextMenuState,
} from '../../../src/renderer/diff/DiffFileContextMenu';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';

const scenario = buildDiffViewerScenario();
const availableState = {
  x: 24,
  y: 32,
  fileId: scenario.files.added.id,
  path: scenario.expected.addedFile.path,
  githubUrl: scenario.expected.addedFile.githubUrl,
  editorAvailable: true,
} satisfies DiffFileContextMenuState;
const unavailableState = {
  x: 24,
  y: 32,
  fileId: scenario.files.deleted.id,
  path: scenario.expected.deletedFile.path,
  editorAvailable: false,
} satisfies DiffFileContextMenuState;

interface MenuCallbacks {
  onClose: () => void;
  onCopy: (text: string) => void;
  onOpenEditor: () => void;
  onOpenGitHub: () => void;
}

function renderDiffFileContextMenu(
  state: DiffFileContextMenuState = availableState,
  callbacks: MenuCallbacks = {
    onClose: () => undefined,
    onCopy: () => undefined,
    onOpenEditor: () => undefined,
    onOpenGitHub: () => undefined,
  },
): void {
  render(<DiffFileContextMenu state={state} {...callbacks} />);
}

function createCallbacks() {
  return {
    onClose: vi.fn<() => void>(),
    onCopy: vi.fn<(text: string) => void>(),
    onOpenEditor: vi.fn<() => void>(),
    onOpenGitHub: vi.fn<() => void>(),
  };
}

describe('DiffFileContextMenu', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('exposes all file actions and a separator when editor and GitHub are available', () => {
    renderDiffFileContextMenu();
    const menu = screen.getByRole('menu', { name: 'Diff file actions' });

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(4);
    expect(
      within(menu).getByRole('menuitem', { name: 'Copy Relative Path' }),
    ).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: 'Open in VS Code' })).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: 'Open on GitHub' })).toBeVisible();
    expect(
      within(menu).getByRole('menuitem', { name: 'Copy GitHub Permalink' }),
    ).toBeVisible();
    expect(within(menu).getByRole('separator')).toBeVisible();
  });

  it('exposes only the path action when editor and GitHub are unavailable', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    renderDiffFileContextMenu(unavailableState, callbacks);
    const menu = screen.getByRole('menu', { name: 'Diff file actions' });
    const pathAction = within(menu).getByRole('menuitem', {
      name: 'Copy Relative Path',
    });

    expect(within(menu).getAllByRole('menuitem')).toEqual([pathAction]);
    expect(within(menu).queryByRole('separator')).toBeNull();

    await user.click(pathAction);

    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(callbacks.onCopy).toHaveBeenCalledOnce();
    expect(callbacks.onCopy).toHaveBeenCalledWith(unavailableState.path);
    expect(callbacks.onOpenEditor).not.toHaveBeenCalled();
    expect(callbacks.onOpenGitHub).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'Copy Relative Path',
      callback: 'copyPath',
    },
    {
      label: 'Open in VS Code',
      callback: 'openEditor',
    },
    {
      label: 'Open on GitHub',
      callback: 'openGitHub',
    },
    {
      label: 'Copy GitHub Permalink',
      callback: 'copyPermalink',
    },
  ] as const)('closes and runs the $label action once', async ({ label, callback }) => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    renderDiffFileContextMenu(availableState, callbacks);

    await user.click(screen.getByRole('menuitem', { name: label }));

    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(callbacks.onCopy).toHaveBeenCalledTimes(
      callback === 'copyPath' || callback === 'copyPermalink' ? 1 : 0,
    );
    expect(callbacks.onOpenEditor).toHaveBeenCalledTimes(
      callback === 'openEditor' ? 1 : 0,
    );
    expect(callbacks.onOpenGitHub).toHaveBeenCalledTimes(
      callback === 'openGitHub' ? 1 : 0,
    );
    if (callback === 'copyPath') {
      expect(callbacks.onCopy).toHaveBeenCalledWith(availableState.path);
    } else if (callback === 'copyPermalink') {
      expect(callbacks.onCopy).toHaveBeenCalledWith(availableState.githubUrl);
    } else if (callback === 'openEditor') {
      expect(callbacks.onOpenEditor).toHaveBeenCalledWith();
    } else {
      expect(callbacks.onOpenGitHub).toHaveBeenCalledWith();
    }
  });
});
