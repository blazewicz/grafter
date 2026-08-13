// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickTooltip } from '../../../src/renderer/ui/QuickTooltip';

function renderQuickTooltip(
  options: {
    label?: string | undefined;
    showDelay?: number;
    align?: 'left' | 'right';
    className?: string;
  } = {},
): HTMLElement {
  render(
    <QuickTooltip {...options}>
      <button type="button">Trigger</button>
    </QuickTooltip>,
  );
  return screen.getByRole('button', { name: 'Trigger' });
}

describe('QuickTooltip', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows the tooltip label when the trigger is hovered', async () => {
    const user = userEvent.setup();
    renderQuickTooltip({ label: 'Switch branch' });

    await user.hover(screen.getByRole('button', { name: 'Trigger' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Switch branch');
  });

  it('does not show a tooltip when no label is provided', async () => {
    const user = userEvent.setup();
    renderQuickTooltip({ label: undefined });

    await user.hover(screen.getByRole('button', { name: 'Trigger' }));

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides the tooltip when the cursor leaves the trigger', async () => {
    const user = userEvent.setup();
    renderQuickTooltip({ label: 'Switch branch' });
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toBeVisible();

    await user.unhover(trigger);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('appears immediately on hover when showDelay is 0', async () => {
    const user = userEvent.setup();
    renderQuickTooltip({ label: 'Switch branch', showDelay: 0 });

    await user.hover(screen.getByRole('button', { name: 'Trigger' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Switch branch');
  });

  it('delays the tooltip by the given showDelay', () => {
    vi.useFakeTimers();
    renderQuickTooltip({ label: 'Switch branch', showDelay: 600 });
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.mouseOver(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Switch branch');
  });

  it('uses a short default delay', () => {
    vi.useFakeTimers();
    renderQuickTooltip({ label: 'Switch branch' });
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.mouseOver(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('tooltip')).toBeVisible();
  });

  it('cancels a pending show when the cursor leaves early', () => {
    vi.useFakeTimers();
    renderQuickTooltip({ label: 'Switch branch', showDelay: 600 });
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.mouseOver(trigger);
    fireEvent.mouseOut(trigger);
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('flips above the trigger when there is no room below', async () => {
    const user = userEvent.setup();
    renderQuickTooltip({ label: 'Switch branch', showDelay: 0 });
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const wrapper = trigger.parentElement;
    if (!wrapper) throw new Error('Expected the tooltip wrapper.');
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 700, 60, 24),
    );

    await user.hover(trigger);
    const tooltip = await screen.findByRole('tooltip');
    vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 200, 40),
    );
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(tooltip).toHaveStyle({ left: '100px', top: '655px' });
  });

  it('composes a className onto the wrapper', () => {
    const trigger = renderQuickTooltip({ className: 'custom-wrapper' });

    expect(trigger.parentElement).toHaveClass('custom-wrapper');
  });
});
