// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CopyButton } from '../../../src/renderer/ui/CopyButton';

interface RenderCopyButtonOptions {
  copied?: boolean;
  copyLabel?: string;
  copiedLabel?: string;
  onCopy?: () => void;
}

function copyButtonProps(options: RenderCopyButtonOptions = {}) {
  return {
    copied: options.copied ?? false,
    copyLabel: options.copyLabel ?? 'Copy worktree path',
    copiedLabel: options.copiedLabel ?? 'Worktree path copied',
    onCopy: options.onCopy ?? (() => undefined),
  };
}

function renderCopyButton(options: RenderCopyButtonOptions = {}): {
  rerender: (options?: RenderCopyButtonOptions) => void;
} {
  const view = render(<CopyButton {...copyButtonProps(options)} />);
  return {
    rerender: (next) => view.rerender(<CopyButton {...copyButtonProps(next)} />),
  };
}

describe('CopyButton', () => {
  afterEach(() => {
    cleanup();
  });

  it('swaps its label and icon when the copied state changes', () => {
    const { rerender } = renderCopyButton();

    const button = screen.getByRole('button', { name: 'Copy worktree path' });
    expect(button).toHaveAttribute('title', 'Copy worktree path');
    expect(button.querySelector('svg')).toHaveClass('lucide-copy');

    rerender({ copied: true });

    expect(button).toHaveAccessibleName('Worktree path copied');
    expect(button).toHaveAttribute('title', 'Worktree path copied');
    expect(button.querySelector('svg')).toHaveClass('lucide-check');
  });
});
