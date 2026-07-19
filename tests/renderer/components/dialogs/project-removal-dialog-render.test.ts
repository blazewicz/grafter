import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectRemovalDialog } from '../../../../src/renderer/components/dialogs/ProjectRemovalDialog';

describe('ProjectRemovalDialog', () => {
  it('explains that removal leaves repository files on disk', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectRemovalDialog, {
        projectName: 'grafter',
        busy: false,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Remove “grafter”?');
    expect(html).toContain('The repository and its worktrees will remain on disk.');
    expect(html).toContain('>Cancel</button>');
    expect(html).toContain('Remove project</button>');
    expect(html).not.toContain('COMMAND');
    expect(html).not.toContain('WORKING DIRECTORY');
  });

  it('disables both actions while removal is in progress', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectRemovalDialog, {
        projectName: 'grafter',
        busy: true,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('lucide-loader-circle');
  });
});
