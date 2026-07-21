import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiffLineContextMenu } from '../../../../src/renderer/components/diff/DiffLineContextMenu';

describe('DiffLineContextMenu', () => {
  it('renders clipboard, editor, and GitHub actions when available', () => {
    const html = renderToStaticMarkup(
      createElement(DiffLineContextMenu, {
        state: {
          x: 100,
          y: 120,
          copyText: 'selected text',
          fileId: 'file-0',
          lineId: 'file-0:0:0',
          range: { startLine: 42 },
          target: {
            path: 'src/App.tsx',
            line: 42,
            revision: 'abc123',
            side: 'new',
          },
          githubUrl: 'https://github.com/example/repo/blob/abc123/src/App.tsx#L42',
          editorAvailable: true,
        },
        onClose: () => undefined,
        onCopy: () => undefined,
        onOpenEditor: () => undefined,
        onOpenGitHub: () => undefined,
      }),
    );

    expect(html).toContain('role="menu"');
    expect(html).toContain('>Copy</span>');
    expect(html).toContain('>Copy Relative Path</span>');
    expect(html).toContain('>Copy Line Reference</span>');
    expect(html).toContain('>Open in VS Code at Line</span>');
    expect(html).toContain('>Open on GitHub</span>');
    expect(html).toContain('>Copy GitHub Permalink</span>');
    expect(html.match(/role="menuitem"/g)).toHaveLength(6);
  });

  it('omits unavailable editor and remote actions', () => {
    const html = renderToStaticMarkup(
      createElement(DiffLineContextMenu, {
        state: {
          x: 100,
          y: 120,
          copyText: 'deleted line',
          fileId: 'file-0',
          lineId: 'file-0:0:0',
          range: { startLine: 4 },
          target: {
            path: 'src/deleted.ts',
            line: 4,
            revision: 'base123',
            side: 'old',
          },
          editorAvailable: false,
        },
        onClose: () => undefined,
        onCopy: () => undefined,
        onOpenEditor: () => undefined,
        onOpenGitHub: () => undefined,
      }),
    );

    expect(html.match(/role="menuitem"/g)).toHaveLength(3);
    expect(html).not.toContain('Open in VS Code');
    expect(html).not.toContain('GitHub');
    expect(html).not.toContain('role="separator"');
  });
});
