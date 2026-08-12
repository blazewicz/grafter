// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickTooltip } from '../../../src/renderer/ui/QuickTooltip';
import styles from '../../../src/renderer/ui/QuickTooltip.module.css';

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
  });

  it('renders its trigger and the tooltip label', () => {
    renderQuickTooltip({ label: 'Switch branch' });

    expect(screen.getByRole('button', { name: 'Trigger' })).toBeVisible();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Switch branch');
  });

  it('does not render a tooltip when no label is provided', () => {
    renderQuickTooltip({ label: undefined });

    expect(screen.getByRole('button', { name: 'Trigger' })).toBeVisible();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('appears immediately on hover when showDelay is 0', () => {
    const trigger = renderQuickTooltip({ showDelay: 0 });

    expect(trigger.parentElement?.style.getPropertyValue('--quick-tooltip-delay')).toBe(
      '0ms',
    );
  });

  it('delays the tooltip by the given showDelay', () => {
    const trigger = renderQuickTooltip({ showDelay: 600 });

    expect(trigger.parentElement?.style.getPropertyValue('--quick-tooltip-delay')).toBe(
      '600ms',
    );
  });

  it('uses a short default delay', () => {
    const trigger = renderQuickTooltip();

    expect(trigger.parentElement?.style.getPropertyValue('--quick-tooltip-delay')).toBe(
      '300ms',
    );
  });

  it('composes a className onto the wrapper', () => {
    const trigger = renderQuickTooltip({ className: 'custom-wrapper' });

    expect(trigger.parentElement).toHaveClass('custom-wrapper');
  });

  it('aligns the tooltip to the right edge when requested', () => {
    const alignRight = styles.alignRight;
    if (!alignRight) throw new Error('Expected the alignRight class to exist.');
    renderQuickTooltip({ label: 'Remove worktree', align: 'right' });

    expect(screen.getByRole('tooltip')).toHaveClass(alignRight);
  });

  it('keeps the tooltip left-aligned by default', () => {
    const alignRight = styles.alignRight;
    if (!alignRight) throw new Error('Expected the alignRight class to exist.');
    renderQuickTooltip({ label: 'Switch branch' });

    expect(screen.getByRole('tooltip')).not.toHaveClass(alignRight);
  });
});
