import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiffFileContextMenu } from '../../../../src/renderer/components/diff/DiffFileContextMenu';

describe('DiffFileContextMenu', () => {
  it('renders path, editor, and GitHub actions when available', () => {
    const html = renderToStaticMarkup(
      createElement(DiffFileContextMenu, {
        state: {
          x: 100,
          y: 120,
          fileId: 'file-0',
          path: 'src/App.tsx',
          githubUrl: 'https://github.com/example/repo/blob/abc123/src/App.tsx',
          editorAvailable: true,
        },
        onClose: () => undefined,
        onCopy: () => undefined,
        onOpenEditor: () => undefined,
        onOpenGitHub: () => undefined,
      }),
    );

    expect(html).toContain('role="menu"');
    expect(html).toContain('aria-label="Diff file actions"');
    expect(html).toContain('>Copy Relative Path</span>');
    expect(html).toContain('>Open in VS Code</span>');
    expect(html).toContain('>Open on GitHub</span>');
    expect(html).toContain('>Copy GitHub Permalink</span>');
    expect(html).not.toContain('>Copy</span>');
    expect(html).not.toContain('Copy Line Reference');
    expect(html.match(/role="menuitem"/g)).toHaveLength(4);
  });

  it('omits unavailable editor and remote actions', () => {
    const html = renderToStaticMarkup(
      createElement(DiffFileContextMenu, {
        state: {
          x: 100,
          y: 120,
          fileId: 'file-0',
          path: 'src/deleted.ts',
          editorAvailable: false,
        },
        onClose: () => undefined,
        onCopy: () => undefined,
        onOpenEditor: () => undefined,
        onOpenGitHub: () => undefined,
      }),
    );

    expect(html.match(/role="menuitem"/g)).toHaveLength(1);
    expect(html).not.toContain('Open in VS Code');
    expect(html).not.toContain('GitHub');
    expect(html).not.toContain('role="separator"');
  });
});
