// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  calculateTooltipPosition,
  SidebarTooltip,
} from '../../../../src/renderer/components/sidebar/SidebarTooltip';

function renderSidebarTooltip(onlyWhenTruncated = false): void {
  render(
    <SidebarTooltip
      className={undefined}
      label="feature/sidebar-tests"
      labelClassName={undefined}
      onlyWhenTruncated={onlyWhenTruncated}
      tooltip="Checked out in ~/Code/grafter.worktrees/sidebar-tests"
    />,
  );
}

describe('SidebarTooltip', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows and hides its tooltip as the label is hovered', async () => {
    const user = userEvent.setup();
    renderSidebarTooltip();

    const label = screen.getByText('feature/sidebar-tests');
    await user.hover(label);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeVisible();
    expect(tooltip).toHaveTextContent(
      'Checked out in ~/Code/grafter.worktrees/sidebar-tests',
    );
    expect(label.parentElement).toHaveAttribute('aria-describedby', tooltip.id);

    await user.unhover(label);

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(label.parentElement).not.toHaveAttribute('aria-describedby');
  });

  it('does not show a truncation-only tooltip when its label fits', async () => {
    const user = userEvent.setup();
    renderSidebarTooltip(true);

    const label = screen.getByText('feature/sidebar-tests');
    setElementWidth(label, 180, 180);
    await user.hover(label);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows a truncation-only tooltip when its label is clipped', async () => {
    const user = userEvent.setup();
    renderSidebarTooltip(true);

    const label = screen.getByText('feature/sidebar-tests');
    setElementWidth(label, 180, 90);
    await user.hover(label);

    expect(await screen.findByRole('tooltip')).toBeVisible();
  });
});

describe('calculateTooltipPosition', () => {
  it('places the tooltip below its label when it fits', () => {
    expect(
      calculateTooltipPosition({
        anchor: { bottom: 70, left: 120, top: 50 },
        tooltipHeight: 30,
        tooltipWidth: 180,
        viewportHeight: 400,
        viewportWidth: 600,
      }),
    ).toEqual({ left: 120, top: 74 });
  });

  it('keeps the tooltip inside the right edge of the viewport', () => {
    expect(
      calculateTooltipPosition({
        anchor: { bottom: 70, left: 270, top: 50 },
        tooltipHeight: 30,
        tooltipWidth: 180,
        viewportHeight: 400,
        viewportWidth: 320,
      }),
    ).toEqual({ left: 132, top: 74 });
  });

  it('flips the tooltip above its label near the bottom edge', () => {
    expect(
      calculateTooltipPosition({
        anchor: { bottom: 390, left: 120, top: 370 },
        tooltipHeight: 50,
        tooltipWidth: 180,
        viewportHeight: 400,
        viewportWidth: 600,
      }),
    ).toEqual({ left: 120, top: 316 });
  });
});

function setElementWidth(
  element: HTMLElement,
  scrollWidth: number,
  clientWidth: number,
): void {
  Object.defineProperties(element, {
    scrollWidth: { configurable: true, value: scrollWidth },
    clientWidth: { configurable: true, value: clientWidth },
  });
}
