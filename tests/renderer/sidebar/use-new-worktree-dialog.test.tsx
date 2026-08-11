// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useNewWorktreeDialog } from '../../../src/renderer/sidebar/useNewWorktreeDialog';

describe('useNewWorktreeDialog', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('opens with Command-N and ignores the shortcut while already open', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useNewWorktreeDialog());

    await user.keyboard('{Meta>}n{/Meta}');

    expect(result.current.adding).toBe(true);

    await user.keyboard('{Meta>}n{/Meta}');

    expect(result.current.adding).toBe(true);
  });

  it('ignores Command-N while another modal dialog is open', async () => {
    const user = userEvent.setup();
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    const { result } = renderHook(() => useNewWorktreeDialog());

    await user.keyboard('{Meta>}n{/Meta}');

    expect(result.current.adding).toBe(false);
  });

  it('opens and closes through the exposed handlers', () => {
    const { result } = renderHook(() => useNewWorktreeDialog());

    act(() => result.current.openNewWorktree());

    expect(result.current.adding).toBe(true);

    act(() => result.current.closeNewWorktree());

    expect(result.current.adding).toBe(false);
  });

  it('restores focus to the add button when the dialog closes', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useNewWorktreeDialog());

    const addButton = document.createElement('button');
    addButton.textContent = 'Add worktree';
    document.body.appendChild(addButton);
    result.current.addWorktreeButtonRef.current = addButton;
    addButton.focus();
    expect(addButton).toHaveFocus();

    await user.keyboard('{Meta>}n{/Meta}');
    act(() => result.current.closeNewWorktree());

    expect(addButton).toHaveFocus();
  });
});
