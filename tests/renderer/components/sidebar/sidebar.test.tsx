// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultSidebarWidth,
  Sidebar,
} from '../../../../src/renderer/components/sidebar/Sidebar';
import { buildSidebarScenario } from '../../../scenarios/sidebar/sidebar';

const scenario = buildSidebarScenario();

interface RenderSidebarOptions {
  width?: number;
  onOpenSettings?: () => void;
  onResize?: (width: number) => void;
}

function renderSidebar(options: RenderSidebarOptions = {}): void {
  render(
    <Sidebar
      homeDirectory={scenario.homeDirectory}
      projects={scenario.projects}
      width={options.width ?? defaultSidebarWidth}
      selectedId={undefined}
      expanded={new Set([scenario.secondProject.id])}
      onSelect={() => undefined}
      onToggleProject={() => undefined}
      onExpandProject={() => undefined}
      onChooseProject={() => undefined}
      onCreated={() => undefined}
      onRemoveProject={() => undefined}
      onRemoveWorktree={() => undefined}
      onOpenSettings={options.onOpenSettings ?? (() => undefined)}
      onError={() => undefined}
      onResize={options.onResize ?? (() => undefined)}
    />,
  );
}

describe('Sidebar', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // TODO: Add composition assertion that ProjectTree gets rendered

  it('opens settings from the global sidebar actions', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    renderSidebar({ onOpenSettings });

    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toBeVisible();

    await user.click(settings);

    expect(onOpenSettings).toHaveBeenCalledOnce();
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
    renderSidebar({ width, onResize });

    const resizeHandle = screen.getByRole('separator', {
      name: 'Resize projects sidebar',
    });
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
    renderSidebar({ width: 360, onResize });

    await user.dblClick(
      screen.getByRole('separator', { name: 'Resize projects sidebar' }),
    );

    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(defaultSidebarWidth);
  });

  it('resizes the sidebar by dragging its handle', async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    renderSidebar({ onResize });

    const resizeHandle = screen.getByRole('separator', {
      name: 'Resize projects sidebar',
    });
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
