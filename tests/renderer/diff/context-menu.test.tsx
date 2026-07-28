// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu, ContextMenuItem } from '../../../src/renderer/diff/ContextMenu';

const itemLabels = ['First action', 'Second action', 'Third action'] as const;

function renderContextMenu(
  onClose: () => void = () => undefined,
  onParentKeyDown: () => void = () => undefined,
): ReturnType<typeof render> {
  return render(
    <div onKeyDown={onParentKeyDown}>
      <ContextMenu position={{ x: 24, y: 32 }} ariaLabel="Test actions" onClose={onClose}>
        {itemLabels.map((label) => (
          <ContextMenuItem
            key={label}
            icon={<span aria-hidden="true" />}
            label={label}
            onClick={() => undefined}
          />
        ))}
      </ContextMenu>
    </div>,
  );
}

function getMenuItems(): HTMLElement[] {
  return within(screen.getByRole('menu', { name: 'Test actions' })).getAllByRole(
    'menuitem',
  );
}

describe('ContextMenu', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('focuses the first menu item on mount', () => {
    renderContextMenu();

    expect(screen.getByRole('menuitem', { name: itemLabels[0] })).toHaveFocus();
  });

  it('moves focus with arrow keys and wraps at both ends', async () => {
    const user = userEvent.setup();
    renderContextMenu();
    const [firstItem, secondItem, thirdItem] = getMenuItems();

    expect(firstItem).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(thirdItem).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(firstItem).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(secondItem).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(firstItem).toHaveFocus();
  });

  it('moves focus to the first and last items with Home and End', async () => {
    const user = userEvent.setup();
    renderContextMenu();
    const [firstItem, , thirdItem] = getMenuItems();

    await user.keyboard('{End}');
    expect(thirdItem).toHaveFocus();

    await user.keyboard('{Home}');
    expect(firstItem).toHaveFocus();
  });

  it('closes once on Escape without propagating the key event', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onParentKeyDown = vi.fn();
    renderContextMenu(onClose, onParentKeyDown);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  it('closes on pointer-down outside but not inside the menu', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderContextMenu(onClose);
    const menu = screen.getByRole('menu', { name: 'Test actions' });

    await user.pointer({ keys: '[MouseLeft]', target: menu });
    expect(onClose).not.toHaveBeenCalled();

    await user.pointer({ keys: '[MouseLeft]', target: document.body });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(['resize', 'blur'] as const)('closes once on window %s', (eventName) => {
    const onClose = vi.fn();
    renderContextMenu(onClose);

    fireEvent(window, new Event(eventName));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('removes dismissal listeners when unmounted', () => {
    const onClose = vi.fn();
    const { unmount } = renderContextMenu(onClose);

    unmount();
    fireEvent.pointerDown(document.body);
    fireEvent.resize(window);
    fireEvent.blur(window);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('prevents context-menu events within the menu', () => {
    renderContextMenu();
    const menu = screen.getByRole('menu', { name: 'Test actions' });
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });

    menu.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
