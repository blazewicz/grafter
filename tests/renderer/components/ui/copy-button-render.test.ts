import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CopyButton } from '../../../../src/renderer/components/ui/CopyButton';

describe('CopyButton', () => {
  it('announces both its copy action and confirmation state', () => {
    const copyHtml = renderToStaticMarkup(
      createElement(CopyButton, {
        copied: false,
        copyLabel: 'Copy worktree path',
        copiedLabel: 'Worktree path copied',
        onCopy: () => undefined,
      }),
    );
    const copiedHtml = renderToStaticMarkup(
      createElement(CopyButton, {
        copied: true,
        copyLabel: 'Copy worktree path',
        copiedLabel: 'Worktree path copied',
        onCopy: () => undefined,
      }),
    );

    expect(copyHtml).toContain('aria-label="Copy worktree path"');
    expect(copyHtml).toContain('lucide-copy');
    expect(copiedHtml).toContain('aria-label="Worktree path copied"');
    expect(copiedHtml).toContain('lucide-check');
  });
});
