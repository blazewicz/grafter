import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppTitlebar } from '../../../../src/renderer/components/shell/AppTitlebar';

describe('AppTitlebar', () => {
  it('keeps repository context and refresh while omitting duplicate branding and settings', () => {
    const html = renderToStaticMarkup(
      createElement(AppTitlebar, {
        projectName: 'grafter',
        worktree: {
          id: 'project:/worktrees/b77c/grafter',
          projectId: 'project',
          displayName: 'b77c/grafter',
          path: '/worktrees/b77c/grafter',
          branch: 'feature/icons',
          head: '1234567',
          isMain: false,
          locked: false,
        },
        canGoBack: false,
        canGoForward: true,
        onBack: () => undefined,
        onForward: () => undefined,
        onSelectProject: () => undefined,
        busy: false,
        onRefresh: () => undefined,
      }),
    );

    expect(html).toContain('grafter');
    expect(html).toContain('b77c/grafter');
    expect(html).toContain('aria-label="Refresh repositories"');
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain('aria-label="Forward"');
    expect(html).toContain('aria-label="Back" title="Back" disabled=""');
    expect(html).toContain('title="Open grafter project details"');
    expect(html).not.toContain('Grafter');
    expect(html).not.toContain('Open settings');
  });
});
