// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Terminal, Box } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ToolPicker,
  type ToolPickerOption,
} from '../../../src/renderer/details/ToolPicker';

const terminalOptions = [
  { id: 'terminal', label: 'Terminal', icon: <Terminal size={13} /> },
  { id: 'iterm2', label: 'iTerm2', icon: <Box size={13} /> },
] as const satisfies readonly ToolPickerOption<string>[];

function renderToolPicker(
  onLaunch: (toolId: string) => void = () => undefined,
  selectedTool = 'terminal',
): void {
  render(
    <ToolPicker
      options={terminalOptions}
      selectedTool={selectedTool}
      openLabelPrefix="Open in"
      chooseLabel="Choose terminal"
      onLaunch={onLaunch}
    />,
  );
}

function getMenuItems(): HTMLElement[] {
  return within(screen.getByRole('menu')).getAllByRole('menuitem');
}

describe('ToolPicker', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('focuses the selected tool when the menu opens', async () => {
    const user = userEvent.setup();
    renderToolPicker(() => undefined, 'iterm2');

    await user.click(screen.getByRole('button', { name: 'Choose terminal' }));

    expect(screen.getByRole('menuitem', { name: 'iTerm2' })).toHaveFocus();
  });

  it('moves focus with arrow keys and wraps at both ends', async () => {
    const user = userEvent.setup();
    renderToolPicker();
    await user.click(screen.getByRole('button', { name: 'Choose terminal' }));
    const [terminalItem, itermItem] = getMenuItems();

    expect(terminalItem).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(itermItem).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(terminalItem).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(itermItem).toHaveFocus();
  });

  it('moves focus to the first and last items with Home and End', async () => {
    const user = userEvent.setup();
    renderToolPicker();
    await user.click(screen.getByRole('button', { name: 'Choose terminal' }));
    const [terminalItem, itermItem] = getMenuItems();

    await user.keyboard('{End}');
    expect(itermItem).toHaveFocus();

    await user.keyboard('{Home}');
    expect(terminalItem).toHaveFocus();
  });

  it('selects the focused option with Enter and closes the menu', async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();
    renderToolPicker(onLaunch);
    const pickerButton = screen.getByRole('button', { name: 'Choose terminal' });
    await user.click(pickerButton);

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onLaunch).toHaveBeenCalledOnce();
    expect(onLaunch).toHaveBeenCalledWith('iterm2');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(pickerButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('selects the focused option with Space and closes the menu', async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();
    renderToolPicker(onLaunch);
    await user.click(screen.getByRole('button', { name: 'Choose terminal' }));

    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');

    expect(onLaunch).toHaveBeenCalledOnce();
    expect(onLaunch).toHaveBeenCalledWith('iterm2');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();
    renderToolPicker(onLaunch);
    const pickerButton = screen.getByRole('button', { name: 'Choose terminal' });
    await user.click(pickerButton);

    expect(screen.getByRole('menuitem', { name: 'Terminal' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(pickerButton).toHaveAttribute('aria-expanded', 'false');
    expect(pickerButton).toHaveFocus();
    expect(onLaunch).not.toHaveBeenCalled();
  });

  it('closes the menu on Tab without launching', async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();
    renderToolPicker(onLaunch);
    const pickerButton = screen.getByRole('button', { name: 'Choose terminal' });
    await user.click(pickerButton);

    await user.tab();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(pickerButton).toHaveAttribute('aria-expanded', 'false');
    expect(onLaunch).not.toHaveBeenCalled();
  });
});
