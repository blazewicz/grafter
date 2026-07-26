// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDiffTree } from '../../../../src/renderer/components/diff/diff-tree';
import { DiffFileTree } from '../../../../src/renderer/components/diff/DiffFileTree';
import type { DiffFileSummary } from '../../../../src/shared/contracts';
import { buildDiffViewerScenario } from '../../../scenarios/diff/diff-viewer';

const scenario = buildDiffViewerScenario();
const tree = buildDiffTree(scenario.branchSession.files);

function renderDiffFileTree({
  expanded = new Set(['src', 'src/renderer', 'src/renderer/components']),
  forceExpanded = false,
  activeFileId,
  contextFileId,
  onToggle = () => undefined,
  onSelect = () => undefined,
  onContextMenu = () => undefined,
}: {
  expanded?: Set<string>;
  forceExpanded?: boolean;
  activeFileId?: string;
  contextFileId?: string;
  onToggle?: (path: string) => void;
  onSelect?: (fileId: string) => void;
  onContextMenu?: (
    event: React.MouseEvent<HTMLButtonElement>,
    file: DiffFileSummary,
  ) => void;
} = {}): void {
  render(
    <nav aria-label="Changed file tree">
      <DiffFileTree
        nodes={tree}
        expanded={expanded}
        forceExpanded={forceExpanded}
        activeFileId={activeFileId}
        contextFileId={contextFileId}
        onToggle={onToggle}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
      />
    </nav>,
  );
}

describe('DiffFileTree', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders recursive directories and changed-file status labels', () => {
    renderDiffFileTree();

    expect(screen.getByRole('button', { name: 'src' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      screen.getByRole('button', {
        name: `Modified file ${scenario.files.modified.path.split('/').at(-1)}`,
      }),
    ).toBeVisible();
  });

  it('forwards directory and file selection actions', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    renderDiffFileTree({ onToggle, onSelect });

    await user.click(screen.getByRole('button', { name: 'src' }));
    await user.click(
      screen.getByRole('button', {
        name: `Modified file ${scenario.files.modified.path.split('/').at(-1)}`,
      }),
    );

    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith('src');
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(scenario.files.modified.id);
  });

  it('forces nested directories visible without changing their toggle callback', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderDiffFileTree({
      expanded: new Set(),
      forceExpanded: true,
      onToggle,
    });

    const rendererDirectory = screen.getByRole('button', { name: 'renderer' });
    expect(rendererDirectory).toHaveAttribute('aria-expanded', 'true');
    await user.click(rendererDirectory);

    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith('src/renderer');
  });

  it('marks active and context-menu files and forwards the context action', () => {
    const onContextMenu = vi.fn();
    renderDiffFileTree({
      activeFileId: scenario.files.modified.id,
      contextFileId: scenario.files.modified.id,
      onContextMenu,
    });
    const fileButton = screen.getByRole('button', {
      name: `Modified file ${scenario.files.modified.path.split('/').at(-1)}`,
    });

    expect(fileButton).toHaveAttribute('aria-current', 'true');
    expect(fileButton).toHaveAttribute('data-context-menu-anchor', 'true');
    fireEvent.contextMenu(fileButton);

    expect(onContextMenu).toHaveBeenCalledOnce();
    expect(onContextMenu).toHaveBeenCalledWith(
      expect.any(Object),
      scenario.files.modified,
    );
  });
});
