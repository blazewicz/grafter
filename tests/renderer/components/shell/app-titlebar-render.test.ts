import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppTitlebar } from '../../../../src/renderer/components/shell/AppTitlebar';

describe('AppTitlebar', () => {
  it('keeps repository context and refresh while omitting duplicate branding and settings', () => {
    const html = renderToStaticMarkup(
      createElement(AppTitlebar, {
        projectName: 'grafter',
        worktreeName: 'b77c/grafter',
        busy: false,
        onRefresh: () => undefined,
      }),
    );

    expect(html).toContain('grafter');
    expect(html).toContain('b77c/grafter');
    expect(html).toContain('aria-label="Refresh repositories"');
    expect(html).not.toContain('Grafter');
    expect(html).not.toContain('Open settings');
  });
});
