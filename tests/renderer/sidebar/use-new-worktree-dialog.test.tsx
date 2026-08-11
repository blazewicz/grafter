// @vitest-environment happy-dom

import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useNewWorktreeDialog } from '../../../src/renderer/sidebar/useNewWorktreeDialog';

describe('useNewWorktreeDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('opens with Command-N and stays open on repeated presses', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useNewWorktreeDialog());

    await user.keyboard('{Meta>}n{/Meta}');

    expect(result.current.isOpen).toBe(true);

    await user.keyboard('{Meta>}n{/Meta}');

    expect(result.current.isOpen).toBe(true);
  });

  it('ignores Command-N while another modal dialog is open', async () => {
    const user = userEvent.setup();
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    const { result } = renderHook(() => useNewWorktreeDialog());

    await user.keyboard('{Meta>}n{/Meta}');

    expect(result.current.isOpen).toBe(false);
    modal.remove();
  });

  it('ignores modified and repeated Command-N presses', () => {
    const { result } = renderHook(() => useNewWorktreeDialog());

    fireEvent.keyDown(document, { key: 'n', metaKey: true, ctrlKey: true });
    fireEvent.keyDown(document, { key: 'n', metaKey: true, repeat: true });

    expect(result.current.isOpen).toBe(false);
  });

  it('opens and closes through the exposed handlers', () => {
    const { result } = renderHook(() => useNewWorktreeDialog());

    act(() => result.current.openDialog());

    expect(result.current.isOpen).toBe(true);

    act(() => result.current.closeDialog());

    expect(result.current.isOpen).toBe(false);
  });
});
