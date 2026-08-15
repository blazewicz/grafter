// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultSidebarWidth,
  ResizeHandle,
} from '../../../src/renderer/sidebar/ResizeHandle';

function renderResizeHandle(
  width = defaultSidebarWidth,
  onResize: (width: number) => void = () => undefined,
): HTMLElement {
  render(<ResizeHandle width={width} onResize={onResize} />);
  return screen.getByRole('separator', { name: 'Resize repository sidebar' });
}

describe('ResizeHandle', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    {
      label: 'left',
      width: defaultSidebarWidth,
      key: '{ArrowLeft}',
      expectedWidth: defaultSidebarWidth - 16,
    },
    {
      label: 'right',
      width: defaultSidebarWidth,
      key: '{ArrowRight}',
      expectedWidth: defaultSidebarWidth + 16,
    },
    {
      label: 'home',
      width: 360,
      key: '{Home}',
      expectedWidth: defaultSidebarWidth,
    },
    {
      label: 'minimum boundary',
      width: 230,
      key: '{ArrowLeft}',
      expectedWidth: 230,
    },
    {
      label: 'maximum boundary',
      width: 480,
      key: '{ArrowRight}',
      expectedWidth: 480,
    },
  ])('resizes $label with the keyboard', async ({ width, key, expectedWidth }) => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    const resizeHandle = renderResizeHandle(width, onResize);

    expect(resizeHandle).toHaveAttribute('aria-valuenow', String(width));
    resizeHandle.focus();
    expect(resizeHandle).toHaveFocus();
    await user.keyboard(key);

    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(expectedWidth);
  });

  it('resets the sidebar width with a double click', async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    const resizeHandle = renderResizeHandle(360, onResize);

    await user.dblClick(resizeHandle);

    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(defaultSidebarWidth);
  });

  it('resizes the sidebar by dragging its handle', async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    const resizeHandle = renderResizeHandle(defaultSidebarWidth, onResize);
    const setPointerCapture = vi.spyOn(resizeHandle, 'setPointerCapture');
    const releasePointerCapture = vi.spyOn(resizeHandle, 'releasePointerCapture');

    await user.pointer([
      {
        keys: '[MouseLeft>]',
        target: resizeHandle,
        coords: { clientX: 300 },
      },
      {
        target: resizeHandle,
        coords: { clientX: 350 },
      },
      {
        keys: '[/MouseLeft]',
        target: resizeHandle,
        coords: { clientX: 350 },
      },
    ]);

    expect(setPointerCapture).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(defaultSidebarWidth + 50);
    expect(releasePointerCapture).toHaveBeenCalledOnce();
  });
});
